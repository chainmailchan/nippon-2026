#!/usr/bin/env python3
"""Read and update the shared trip data from a Claude session (or any computer).

The phones and iPad keep editing in the app as usual; this is a second door into the same Firestore data.
It signs in anonymously, like the app, so it can only reach the trip whose key it is given.

The trip key comes from the NIPPON_TRIP_KEY environment variable (or --key). Never commit it or print it.

  python3 tools/trip_admin.py list places              # id, name/title per line
  python3 tools/trip_admin.py get bookings b-dinner    # one document as JSON
  python3 tools/trip_admin.py put places new.json      # add or replace documents (object, list, or {coll: {...}})
  python3 tools/trip_admin.py patch lists l-1 '{"done": true}'
  python3 tools/trip_admin.py delete places some-id
  python3 tools/trip_admin.py meta                     # trip dates
  python3 tools/trip_admin.py export > backup.json     # everything (private: keep out of the repo)

Collections: places, bookings, items, lists, reviews. Field shapes: docs/SPEC.md §5.
"""
import argparse, datetime, json, os, re, ssl, sys, urllib.error, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLLS = ('places', 'bookings', 'items', 'lists', 'reviews')


def firebase_config():
    # Single source of truth: the web config in app/config.js (not secret).
    src = open(os.path.join(ROOT, 'app', 'config.js'), encoding='utf8').read()
    m = re.search(r"apiKey:\s*'([^']+)'.*?projectId:\s*'([^']+)'", src, re.S)
    if not m: sys.exit('FIREBASE_CONFIG is not set in app/config.js')
    return m.group(1), m.group(2)


CA = os.environ.get('SSL_CERT_FILE') or os.environ.get('REQUESTS_CA_BUNDLE')
CTX = ssl.create_default_context(cafile=CA) if CA and os.path.exists(CA) else ssl.create_default_context()


def call(url, body=None, token=None, method=None):
    headers = {'Content-Type': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers=headers, method=method or ('POST' if body is not None else 'GET'))
    try:
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b'{}')
        except Exception: return e.code, {}


def enc(v):
    if v is None: return {'nullValue': None}
    if isinstance(v, bool): return {'booleanValue': v}
    if isinstance(v, int): return {'integerValue': str(v)}
    if isinstance(v, float): return {'doubleValue': v}
    if isinstance(v, str): return {'stringValue': v}
    if isinstance(v, list): return {'arrayValue': {'values': [enc(x) for x in v]}}
    if isinstance(v, dict): return {'mapValue': {'fields': {k: enc(x) for k, x in v.items()}}}
    raise TypeError(f'cannot store {type(v).__name__}')


def dec(v):
    if 'nullValue' in v: return None
    if 'booleanValue' in v: return v['booleanValue']
    if 'integerValue' in v: return int(v['integerValue'])
    if 'doubleValue' in v: return v['doubleValue']
    if 'stringValue' in v: return v['stringValue']
    if 'timestampValue' in v: return v['timestampValue']
    if 'arrayValue' in v: return [dec(x) for x in v['arrayValue'].get('values', [])]
    if 'mapValue' in v: return {k: dec(x) for k, x in v['mapValue'].get('fields', {}).items()}
    return None


class Trip:
    def __init__(self, key):
        api_key, project = firebase_config()
        st, auth = call('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + api_key, {'returnSecureToken': True})
        if st != 200: sys.exit(f"Sign-in failed ({st}): {auth.get('error', {}).get('message')}")
        self.token = auth['idToken']
        self.base = f'https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/trips/{key}'

    def _check(self, st, res, what):
        if st == 403: sys.exit('Permission denied: wrong trip key, or the Firestore rules changed.')
        if st >= 400: sys.exit(f"{what} failed ({st}): {res.get('error', {}).get('message')}")

    def all(self, coll):
        out, page = [], ''
        while True:
            st, res = call(f'{self.base}/{coll}?pageSize=300' + (f'&pageToken={urllib.parse.quote(page)}' if page else ''), token=self.token)
            self._check(st, res, 'List')
            out += [{k: dec(v) for k, v in d.get('fields', {}).items()} | {'id': d['name'].rsplit('/', 1)[1]} for d in res.get('documents', [])]
            page = res.get('nextPageToken')
            if not page: return out

    def get(self, coll, doc_id):
        st, res = call(f'{self.base}/{coll}/{doc_id}', token=self.token)
        if st == 404: return None
        self._check(st, res, 'Get')
        return {k: dec(v) for k, v in res.get('fields', {}).items()}

    def put(self, coll, doc, by):
        if not doc.get('id'): sys.exit('Every document needs an "id"')
        now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
        prev = self.get(coll, doc['id'])
        doc = {**doc, 'added': doc.get('added') or (prev or {}).get('added') or {'by': by, 'at': now}, 'updated': {'by': by, 'at': now}}
        st, res = call(f"{self.base}/{coll}/{doc['id']}", {'fields': {k: enc(v) for k, v in doc.items()}}, self.token, 'PATCH')
        self._check(st, res, 'Write')
        return 'replaced' if prev else 'added'

    def patch(self, coll, doc_id, fields, by):
        prev = self.get(coll, doc_id)
        if prev is None: sys.exit(f'No {coll}/{doc_id}')
        return self.put(coll, {**prev, **fields, 'id': doc_id}, by)

    def delete(self, coll, doc_id):
        st, res = call(f'{self.base}/{coll}/{doc_id}', token=self.token, method='DELETE')
        self._check(st, res, 'Delete')

    def meta(self):
        st, res = call(self.base, token=self.token)
        if st == 404: return {}
        self._check(st, res, 'Read')
        return {k: dec(v) for k, v in res.get('fields', {}).items()}


def docs_from(path, coll):
    data = json.load(open(path, encoding='utf8'))
    if isinstance(data, dict) and coll in data and isinstance(data[coll], (dict, list)): data = data[coll]
    if isinstance(data, dict) and 'id' in data: return [data]
    return list(data.values()) if isinstance(data, dict) else data


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('command', choices=['list', 'get', 'put', 'patch', 'delete', 'meta', 'export'])
    ap.add_argument('args', nargs='*')
    ap.add_argument('--key', default=os.environ.get('NIPPON_TRIP_KEY', ''))
    ap.add_argument('--by', default='Claude', help='name stamped on added/updated')
    a = ap.parse_args()
    if not a.key: sys.exit('Set NIPPON_TRIP_KEY (or pass --key).')
    if a.command in ('list', 'get', 'put', 'patch', 'delete') and (not a.args or a.args[0] not in COLLS):
        sys.exit('First argument must be one of: ' + ', '.join(COLLS))
    trip = Trip(a.key.strip().lower())

    if a.command == 'list':
        for d in sorted(trip.all(a.args[0]), key=lambda d: d['id']):
            print(d['id'], '·', d.get('name') or d.get('title') or '', '·', d.get('start') or d.get('status') or d.get('list') or '')
    elif a.command == 'get':
        print(json.dumps(trip.get(a.args[0], a.args[1]), ensure_ascii=False, indent=1))
    elif a.command == 'put':
        for d in docs_from(a.args[1], a.args[0]):
            print(trip.put(a.args[0], d, a.by), d['id'])
    elif a.command == 'patch':
        print(trip.patch(a.args[0], a.args[1], json.loads(a.args[2]), a.by), a.args[1])
    elif a.command == 'delete':
        trip.delete(a.args[0], a.args[1]); print('deleted', a.args[1])
    elif a.command == 'meta':
        print(json.dumps(trip.meta(), ensure_ascii=False))
    elif a.command == 'export':
        print(json.dumps({'meta': trip.meta(), **{c: {d['id']: d for d in trip.all(c)} for c in COLLS}}, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()

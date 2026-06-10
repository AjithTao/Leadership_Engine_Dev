# -*- coding: utf-8 -*-
"""
M3 DMS deep-dive — try alternative counting approaches
to understand what the PDF 145 tests represent
SNAP=2026-04-10  PI_FROM=2026-04-01  PDF DMS: Tests=145 Stories=37
"""
import os
import urllib.request, json, sys, re
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

JIRA_URL = "https://projects.cdk.com"
TOKEN    = os.environ["JIRA_API_TOKEN"]
HEADERS  = {"Authorization": f"Bearer {TOKEN}",
            "Accept": "application/json", "Content-Type": "application/json"}

PI_FROM = "2026-04-01"
SNAP    = "2026-04-10"

DMS_PROJECTS = ["ARMODACC","AIMODACC","APMODACC","FSMODACC","GLMODACC","POMODACC",
                "MODACCRPTS","MODSET","YEMODACC","MODBETC","MODSRCH","MODDWTC","MDWP",
                "MODPLAT","MODTOOL","BRMODACC","ACC","FSACC","DRV","MGDIT","PKM",
                "SODRV","TRKMOD","TRKMISC","MODOEM","OEMI","PSRD"]

SEP  = "=" * 115
DASH = "-" * 115

def run_jql(jql):
    payload = json.dumps({"jql": jql, "maxResults": 0, "fields": ["key"]}).encode()
    req = urllib.request.Request(f"{JIRA_URL}/rest/api/2/search",
                                 data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read()).get("total", "ERR"), None
    except urllib.request.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8", errors="replace"))
            msgs = body.get("errorMessages", []) + list(body.get("errors", {}).values())
            return "ERR", " | ".join(str(x) for x in msgs)[:150]
        except:
            return "ERR", str(e)
    except Exception as e:
        return "ERR", str(e)

def bad_project(err):
    m = re.search(r"'([A-Z0-9]+)' does not exist for the field 'project'", err or "")
    return m.group(1) if m else None

def run_safe(jql_fn, projects):
    valid = list(projects); removed = []
    while valid:
        t, err = run_jql(jql_fn(valid))
        if err is None: return t, valid, removed
        bp = bad_project(err)
        if bp and bp in valid:
            valid.remove(bp); removed.append(bp)
        else:
            return f"ERR:{err[:80]}", valid, removed
    return "ERR", [], removed

def prj(projects):
    return f'project IN ({",".join(chr(34)+p+chr(34) for p in projects)})'

print(SEP)
print(f"  DMS Deep-Dive  |  SNAP={SNAP}  PDF: Tests=145  Stories=37")
print(SEP)

s, valid, rem = run_safe(
    lambda p: (f'{prj(p)} AND issuetype = Story AND "Story Type" = Dev'
               f' AND status IN ("Accepted","Test Complete","Done")'
               f' AND resolved >= "{PI_FROM}" AND resolved <= "{SNAP} 23:59"'),
    DMS_PROJECTS)
if rem: print(f"  [skip invalid]: {', '.join(rem)}")
print(f"  Stories (A4): {s}  (PDF=37)")

PRJ = prj(valid)
INNER = (f'issuetype = Story AND \\"Story Type\\" = Dev'
         f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
         f' AND resolved >= \'{PI_FROM}\' AND resolved <= \'{SNAP} 23:59\'')

print(f"\n  {'Approach':<65}  {'Count':>7}  {'Diff(vs145)':>12}")
print(DASH)

queries = [
    # How we currently count (best)
    ("CURRENT: is tested by, tests in DMS projects",
     f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
     f' AND issueFunction in linkedIssuesOf("{INNER}", "is tested by")'),
    # Try different test statuses
    ("Tests in DMS, is tested by, NO status filter",
     f'{PRJ} AND issuetype = Test'
     f' AND issueFunction in linkedIssuesOf("{INNER}", "is tested by")'),
    # Tests created in PI window, no link required
    ("Tests created in PI, no link (pure creation-based)",
     f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
     f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'),
    # Tests created in PI with ANY status
    ("Tests created in PI, no link, no status filter",
     f'{PRJ} AND issuetype = Test'
     f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'),
    # Tests created in PI + linked to ANY closed Dev story (not just PI-resolved)
    ("Tests created in PI + linked to ANY closed Dev story",
     f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
     f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
     f' AND issueFunction in linkedIssuesOf("issuetype = Story'
     f' AND \\"Story Type\\" = Dev'
     f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")")'),
    # Tests with update date in PI window
    ("Tests updated in PI, is tested by",
     f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
     f' AND updated >= "{PI_FROM}" AND updated <= "{SNAP} 23:59"'
     f' AND issueFunction in linkedIssuesOf("{INNER}", "is tested by")'),
    # Try issuetype = "Test Case" instead of Test
    ("issuetype = 'Test Case', is tested by",
     f'{PRJ} AND issuetype = "Test Case" AND status NOT IN (Abandoned)'
     f' AND issueFunction in linkedIssuesOf("{INNER}", "is tested by")'),
    # All tests in DMS regardless of date
    ("All Tests in DMS projects (no date, no link)",
     f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'),
    # A5 stories (broader) linked tests
    ("Tests linked to A5 stories (broader story def)",
     f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
     f' AND issueFunction in linkedIssuesOf("issuetype = Story'
     f' AND \\"Story Type\\" = Dev'
     f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP} 23:59\''
     f' AND status NOT IN (Abandoned)'
     f' AND resolved <= \'{SNAP} 23:59\'", "is tested by")'),
]

for label, jql in queries:
    t, err = run_jql(jql)
    if err:
        print(f"  {label:<65}  ERR: {err[:40]}")
        continue
    try:
        diff = f"{int(t)-145:+d}"
        mark = "  <--" if abs(int(t)-145) <= 5 else ""
    except:
        diff = "ERR"; mark = ""
    print(f"  {label:<65}  {str(t):>7}  {diff:>12}{mark}")

print(DASH)
print(f"\n{SEP}")

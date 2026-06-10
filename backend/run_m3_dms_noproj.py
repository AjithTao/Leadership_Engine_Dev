# -*- coding: utf-8 -*-
"""
M3 DMS — test with no project filter on the test side
to check if 35 missing tests live in projects outside DMS project list
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

# For outer JQL — literal double quotes
def prj(projects):
    return f'project IN ({",".join(chr(34)+p+chr(34) for p in projects)})'

# For inner JQL inside linkedIssuesOf("...") — double quotes must be escaped as \"
def prj_inner(projects):
    return f'project IN ({",".join(chr(92)+chr(34)+p+chr(92)+chr(34) for p in projects)})'

def stories_A4(projects):
    return (f'{prj(projects)} AND issuetype = Story AND "Story Type" = Dev'
            f' AND status IN ("Accepted","Test Complete","Done")'
            f' AND resolved >= "{PI_FROM}" AND resolved <= "{SNAP} 23:59"')

# Standard INNER (no project filter) — works for "Tests IN DMS projects" variants
INNER = (f'issuetype = Story AND \\"Story Type\\" = Dev'
         f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
         f' AND resolved >= \'{PI_FROM}\' AND resolved <= \'{SNAP} 23:59\'')

print(SEP)
print(f"  DMS — No Project Filter on Tests  |  SNAP={SNAP}")
print(f"  PDF DMS: Tests=145  Stories=37")
print(SEP)

s, valid, rem = run_safe(stories_A4, DMS_PROJECTS)
if rem: print(f"  [skip invalid]: {', '.join(rem)}")
print(f"\n  Stories (A4): {s}  (PDF=37  diff={int(s)-37:+d})")

# Build INNER with DMS project scope (properly escaped for embedding)
DMS_PRJ_INNER = prj_inner(valid)
INNER_DMS = (f'{DMS_PRJ_INNER} AND issuetype = Story AND \\"Story Type\\" = Dev'
             f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
             f' AND resolved >= \'{PI_FROM}\' AND resolved <= \'{SNAP} 23:59\'')

variants = [
    ("Tests IN DMS projects, is tested by (current best)",
     lambda p: (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
                f' AND issueFunction in linkedIssuesOf("{INNER}", "is tested by")')),
    ("Tests IN DMS projects, all links",
     lambda p: (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
                f' AND issueFunction in linkedIssuesOf("{INNER}")')),
    ("Tests in ANY project, is tested by",
     lambda p: (f'issuetype = Test AND status NOT IN (Abandoned)'
                f' AND issueFunction in linkedIssuesOf("{INNER_DMS}", "is tested by")')),
    ("Tests in ANY project, all links",
     lambda p: (f'issuetype = Test AND status NOT IN (Abandoned)'
                f' AND issueFunction in linkedIssuesOf("{INNER_DMS}")')),
    ("Tests in ANY project, subtasksOf",
     lambda p: (f'issuetype = Test AND status NOT IN (Abandoned)'
                f' AND issueFunction in subtasksOf("{INNER_DMS}")')),
    ("Tests in ANY project, is tested by OR subtasksOf",
     lambda p: (f'issuetype = Test AND status NOT IN (Abandoned)'
                f' AND (issueFunction in linkedIssuesOf("{INNER_DMS}", "is tested by")'
                f' OR issueFunction in subtasksOf("{INNER_DMS}"))')),
]

print(f"\n  {'Variant':<60}  {'Tests':>7}  {'Diff':>6}")
print(DASH)
for label, jql_fn in variants:
    t, err = run_jql(jql_fn(valid))
    if err:
        print(f"  {label:<60}  ERR: {err[:50]}")
        continue
    try:
        diff = f"{int(t)-145:+d}"
        mark = "  <-- BEST" if abs(int(t)-145) <= 5 else ""
    except:
        diff = "ERR"; mark = ""
    print(f"  {label:<60}  {str(t):>7}  {diff:>6}{mark}")
print(DASH)

print(f"\n{SEP}")
print(f"  INNER_DMS used for no-proj variants:")
print(f"  {INNER_DMS}")
print(f"{SEP}")

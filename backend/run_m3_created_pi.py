# -*- coding: utf-8 -*-
"""
M3 — "Tests created in PI" approach (no link requirement) vs current "is tested by"
Testing across all 3 portfolios
SNAP=2026-04-10  PI_FROM=2026-04-01
PDF 04/10: DP=48/40  DS=43/21  DMS=145/37
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

PORTFOLIOS = {
    "Data Platform": {
        "projects": ["MDSICAP","MDSIA","OIP","MPSUPDATES","MPSMOD","AAP","AIVAPL","MDMCOGS",
                     "AIVA","ASYNCAPI","DNASYND","DPREQ","DNAST","EDPOEMI","MDSMIG","MDSEDP",
                     "TDO","TDOPS","TDP","TDQ","UDC","UDI"],
        "pdf_tests": 48, "pdf_stories": 40,
    },
    "Data Solutions": {
        "projects": ["NDP","NPS","DNADEDGE","APITRON","DET","WRAAP","WRP"],
        "pdf_tests": 43, "pdf_stories": 21,
    },
    "DMS": {
        "projects": ["ARMODACC","AIMODACC","APMODACC","FSMODACC","GLMODACC","POMODACC",
                     "MODACCRPTS","MODSET","YEMODACC","MODBETC","MODSRCH","MODDWTC","MDWP",
                     "MODPLAT","MODTOOL","BRMODACC","ACC","FSACC","DRV","MGDIT","PKM",
                     "SODRV","TRKMOD","TRKMISC","MODOEM","OEMI","PSRD"],
        "pdf_tests": 145, "pdf_stories": 37,
    },
}

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

INNER = (f'issuetype = Story AND \\"Story Type\\" = Dev'
         f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
         f' AND resolved >= \'{PI_FROM}\' AND resolved <= \'{SNAP} 23:59\'')

def stories_A4(projects):
    return (f'{prj(projects)} AND issuetype = Story AND "Story Type" = Dev'
            f' AND status IN ("Accepted","Test Complete","Done")'
            f' AND resolved >= "{PI_FROM}" AND resolved <= "{SNAP} 23:59"')

# Current best: is tested by
def tests_itb(projects):
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{INNER}", "is tested by")')

# New: tests created in PI window (no link requirement)
def tests_created_pi(projects):
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"')

# Hybrid: created in PI OR linked via is tested by
def tests_created_or_itb(projects):
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND (created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
            f' OR issueFunction in linkedIssuesOf("{INNER}", "is tested by"))')

# Created in PI + linked to any Dev story (closed or not)
def tests_created_linked_any(projects):
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
            f' AND issueFunction in linkedIssuesOf("issuetype = Story AND \\"Story Type\\" = Dev")')

VARIANTS = [
    ("is tested by [current best]",     tests_itb),
    ("created in PI, no link",          tests_created_pi),
    ("created in PI OR is tested by",   tests_created_or_itb),
    ("created in PI + linked any Dev",  tests_created_linked_any),
]

print(SEP)
print(f"  M3 — Created-in-PI Approach vs Is-Tested-By  |  SNAP={SNAP}")
print(f"  PDF 04/10: DP=48/40   DS=43/21   DMS=145/37")
print(SEP)

all_results = {}
for portfolio, cfg in PORTFOLIOS.items():
    projects = cfg["projects"]
    s, valid, rem = run_safe(stories_A4, projects)
    if rem: print(f"  [skip invalid]: {', '.join(rem)}")
    all_results[portfolio] = {"s": s, "valid": valid, "pdf_t": cfg["pdf_tests"], "pdf_s": cfg["pdf_stories"]}
    print(f"\n  [{portfolio}]  Stories(A4)={s}  PDF Stories={cfg['pdf_stories']}  PDF Tests={cfg['pdf_tests']}")
    for label, t_fn in VARIANTS:
        t, _, _ = run_safe(t_fn, valid)
        try:
            ratio = round(int(t)/int(s), 2) if int(s) > 0 else 0.0
            diff  = f"{int(t)-cfg['pdf_tests']:+d}"
            mark  = "  <--" if abs(int(t)-cfg['pdf_tests']) <= 3 else ""
        except:
            ratio = "ERR"; diff = "ERR"; mark = ""
        all_results[portfolio][label] = {"t": t, "diff": diff}
        print(f"    {label:<42}  Tests={str(t):<8}  Ratio={str(ratio):<6}  Diff={diff}{mark}")

print(f"\n\n{SEP}")
print(f"  SUMMARY  |  SNAP={SNAP}")
print(SEP)
print(f"  {'Approach':<42}  {'DP(PDF=48)':>12}  {'DS(PDF=43)':>12}  {'DMS(PDF=145)':>14}")
print(DASH)
for label, _ in VARIANTS:
    row = f"  {label:<42}"
    for portfolio, cfg in PORTFOLIOS.items():
        r = all_results[portfolio].get(label, {})
        try:
            row += f"  {str(r['t']):>7}({r['diff']:>+3})"
        except:
            row += f"  {'ERR':>12}"
    print(row)
print(DASH)
print(f"\n{SEP}")

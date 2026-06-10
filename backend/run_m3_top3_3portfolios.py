# -*- coding: utf-8 -*-
"""
M3 Test:Story Ratio — Top 3 Story Approaches x 3 Portfolios
Week ending 04/10/2026  |  PI2 CY26  PI_FROM=2026-04-01
PDF Reference 04/10:
  Data Platform  : Tests=48  Stories=40  Ratio=1.20
  Data Solutions : Tests=43  Stories=21  Ratio=2.05
  DMS            : Tests=145 Stories=37  Ratio=3.92
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
        "pdf_tests": 48, "pdf_stories": 40, "pdf_ratio": 1.20,
    },
    "Data Solutions": {
        "projects": ["NDP","NPS","DNADEDGE","APITRON","DET","WRAAP","WRP"],
        "pdf_tests": 43, "pdf_stories": 21, "pdf_ratio": 2.05,
    },
    "DMS": {
        "projects": ["ARMODACC","AIMODACC","APMODACC","FSMODACC","GLMODACC","POMODACC",
                     "MODACCRPTS","MODSET","YEMODACC","MODBETC","MODSRCH","MODDWTC","MDWP",
                     "MODPLAT","MODTOOL","BRMODACC","ACC","FSACC","DRV","MGDIT","PKM",
                     "SODRV","TRKMOD","TRKMISC","MODOEM","OEMI","PSRD"],
        "pdf_tests": 145, "pdf_stories": 37, "pdf_ratio": 3.92,
    },
}

SEP  = "=" * 115
DASH = "-" * 115

# ── Jira helpers ──────────────────────────────────────────────────────────────
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
            return "ERR", " | ".join(str(x) for x in msgs)[:100]
        except:
            return "ERR", str(e)
    except Exception as e:
        return "ERR", str(e)

def bad_project(err):
    if not err: return None
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
            return "ERR", valid, removed
    return "ERR", [], removed

# ── JQL builders ─────────────────────────────────────────────────────────────
def prj(projects): return f'project IN ({",".join(f"{chr(34)}{p}{chr(34)}" for p in projects)})'

def stories_A1(projects):
    return (f'{prj(projects)} AND issuetype = Story AND "Story Type" = Dev'
            f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
            f' AND status IN ("Accepted","Test Complete","Done")'
            f' AND resolved <= "{SNAP} 23:59"')

def stories_A4(projects):
    return (f'{prj(projects)} AND issuetype = Story AND "Story Type" = Dev'
            f' AND status IN ("Accepted","Test Complete","Done")'
            f' AND resolved >= "{PI_FROM}" AND resolved <= "{SNAP} 23:59"')

def stories_A5(projects):
    return (f'{prj(projects)} AND issuetype = Story AND "Story Type" = Dev'
            f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
            f' AND status NOT IN (Abandoned)'
            f' AND resolved <= "{SNAP} 23:59"')

# Tests linked to stories matching the same filter
def tests_for_A1(projects):
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("issuetype = Story'
            f' AND \\"Story Type\\" = Dev'
            f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP} 23:59\''
            f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
            f' AND resolved <= \'{SNAP} 23:59\'")')

def tests_for_A4(projects):
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("issuetype = Story'
            f' AND \\"Story Type\\" = Dev'
            f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
            f' AND resolved >= \'{PI_FROM}\' AND resolved <= \'{SNAP} 23:59\'")')

def tests_for_A5(projects):
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("issuetype = Story'
            f' AND \\"Story Type\\" = Dev'
            f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP} 23:59\''
            f' AND status NOT IN (Abandoned)'
            f' AND resolved <= \'{SNAP} 23:59\'")')

APPROACHES = [
    ("A1", "created+closed+resolved<=snap",       stories_A1, tests_for_A1),
    ("A4", "resolved-in-PI+closed  [BEST 04/10]", stories_A4, tests_for_A4),
    ("A5", "created+NOT-Abandoned+resolved<=snap", stories_A5, tests_for_A5),
]

# ── Main ─────────────────────────────────────────────────────────────────────
print(SEP)
print(f"  M3 TEST:STORY RATIO  |  3 Portfolios  |  Top 3 Approaches  |  SNAP={SNAP}")
print(SEP)

all_results = {}
for portfolio, cfg in PORTFOLIOS.items():
    projects = cfg["projects"]
    all_results[portfolio] = {}
    print(f"\n  [{portfolio}]  ({len(projects)} projects)  PDF: Tests={cfg['pdf_tests']}  Stories={cfg['pdf_stories']}  Ratio={cfg['pdf_ratio']}")
    for ap_id, ap_label, s_fn, t_fn in APPROACHES:
        s, valid, rem = run_safe(s_fn, projects)
        t, _, _       = run_safe(t_fn, valid)
        if rem:
            print(f"    [skip invalid]: {', '.join(rem)}")
        try:
            ratio = round(int(t)/int(s), 2) if int(s) > 0 else 0.0
            sdiff = int(s) - cfg["pdf_stories"]
            tdiff = int(t) - cfg["pdf_tests"]
        except:
            ratio = sdiff = tdiff = "ERR"
        all_results[portfolio][ap_id] = {"s": s, "t": t, "ratio": ratio, "sdiff": sdiff, "tdiff": tdiff}
        print(f"    {ap_id} ({ap_label}): Stories={s}  Tests={t}  Ratio={ratio}", flush=True)

# ── Summary table ─────────────────────────────────────────────────────────────
print(f"\n\n{SEP}")
print(f"  SUMMARY  |  M3  |  3 Portfolios  |  Top 3 Approaches vs PDF  |  SNAP={SNAP}")
print(SEP)
print(f"  {'Portfolio':<20}  {'Approach':<45}  {'Stories':>8}  {'Tests':>7}  {'Ratio':>6}  {'StorDiff':>9}  {'TestDiff':>9}")
print(DASH)

for portfolio, cfg in PORTFOLIOS.items():
    print(f"  {'─'*20}  PDF Reference{'':<32}  {cfg['pdf_stories']:>8}  {cfg['pdf_tests']:>7}  {cfg['pdf_ratio']:>6}  {'---':>9}  {'---':>9}")
    for ap_id, ap_label, _, _ in APPROACHES:
        r = all_results[portfolio][ap_id]
        try:
            sd = f"{r['sdiff']:>+9}"
            td = f"{r['tdiff']:>+9}"
            mark = "  <--" if abs(r['sdiff']) <= 3 and abs(r['tdiff']) <= 5 else ""
        except:
            sd = td = "      ERR"
            mark = ""
        print(f"  {portfolio:<20}  {ap_id}: {ap_label:<40}  {str(r['s']):>8}  {str(r['t']):>7}  {str(r['ratio']):>6}  {sd}  {td}{mark}")
    print(DASH)

# ── JQL reference ─────────────────────────────────────────────────────────────
print(f"\n{SEP}")
print(f"  JQL REFERENCE  |  Data Platform (representative)  |  SNAP={SNAP}")
print(SEP)
dp_projects = PORTFOLIOS["Data Platform"]["projects"]
for ap_id, ap_label, s_fn, t_fn in APPROACHES:
    print(f"\n  [{ap_id}] {ap_label}")
    print(f"  Stories: {s_fn(dp_projects)}")
    print(f"  Tests:   {t_fn(dp_projects)}")
print(f"\n{SEP}")

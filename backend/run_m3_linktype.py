# -*- coding: utf-8 -*-
"""
M3 Test:Story Ratio — A4 stories + link-type filtered tests
Testing "is tested by" and "tests" link directions
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
            return "ERR", " | ".join(str(x) for x in msgs)[:120]
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
            return "ERR", valid, removed
    return "ERR", [], removed

def prj(projects):
    return f'project IN ({",".join(chr(34)+p+chr(34) for p in projects)})'

# A4 stories — resolved in PI window + closed (best story match)
def stories_A4(projects):
    return (f'{prj(projects)} AND issuetype = Story AND "Story Type" = Dev'
            f' AND status IN ("Accepted","Test Complete","Done")'
            f' AND resolved >= "{PI_FROM}" AND resolved <= "{SNAP} 23:59"')

# Inner story JQL for linkedIssuesOf (single-quoted dates)
INNER_A4 = (f'issuetype = Story AND \\"Story Type\\" = Dev'
            f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
            f' AND resolved >= \'{PI_FROM}\' AND resolved <= \'{SNAP} 23:59\'')

# Test queries with different link type filters
def tests_no_linktype(projects):
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{INNER_A4}")')

def tests_is_tested_by(projects):
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{INNER_A4}", "is tested by")')

def tests_tests_link(projects):
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{INNER_A4}", "tests")')

# Also try without project filter on tests (tests may live in different project)
def tests_no_project_filter_all_links(projects):
    return (f'issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{prj(projects)} AND {INNER_A4}")')

def tests_no_project_filter_tested_by(projects):
    return (f'issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{prj(projects)} AND {INNER_A4}", "is tested by")')

def tests_no_project_filter_tests(projects):
    return (f'issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{prj(projects)} AND {INNER_A4}", "tests")')

TEST_VARIANTS = [
    ("T-no-linktype       [prev A4 result]",          tests_no_linktype,               True),
    ("T-is-tested-by      [link: story 'is tested by' test]", tests_is_tested_by,      True),
    ("T-tests             [link: test 'tests' story]", tests_tests_link,               True),
    ("T-no-proj-all-links [tests in any project]",     tests_no_project_filter_all_links, False),
    ("T-no-proj-is-tested-by",                        tests_no_project_filter_tested_by, False),
    ("T-no-proj-tests",                               tests_no_project_filter_tests,   False),
]

print(SEP)
print(f"  M3 — Link Type Test  |  A4 Stories + Link-filtered Tests  |  SNAP={SNAP}")
print(f"  PDF 04/10: DP=48/40   DS=43/21   DMS=145/37")
print(SEP)

all_results = {}
for portfolio, cfg in PORTFOLIOS.items():
    projects = cfg["projects"]
    print(f"\n  [{portfolio}]  PDF Tests={cfg['pdf_tests']}  Stories={cfg['pdf_stories']}")

    s, valid, rem = run_safe(stories_A4, projects)
    if rem: print(f"    [skip invalid]: {', '.join(rem)}")
    print(f"    Stories (A4): {s}  (PDF={cfg['pdf_stories']}  diff={int(s)-cfg['pdf_stories']:+d})")

    all_results[portfolio] = {"stories": s, "tests": {}}
    for label, t_fn, use_valid in TEST_VARIANTS:
        proj_arg = valid if use_valid else projects
        t, _, _ = run_safe(t_fn, proj_arg)
        try:
            ratio = round(int(t)/int(s), 2) if int(s) > 0 else 0.0
            diff  = f"{int(t)-cfg['pdf_tests']:+d}"
        except:
            ratio = "ERR"; diff = "ERR"
        all_results[portfolio]["tests"][label] = {"t": t, "ratio": ratio, "diff": diff}
        print(f"    {label:<52}  Tests={t}  Ratio={ratio}  DiffTests={diff}")

# ── Summary ───────────────────────────────────────────────────────────────────
print(f"\n\n{SEP}")
print(f"  SUMMARY  |  A4 Stories + Link-Type Test Filters  |  SNAP={SNAP}")
print(SEP)
print(f"  {'Test Filter':<52}  {'DP Tests':>9}  {'DS Tests':>9}  {'DMS Tests':>10}")
print(f"  {'':52}  {'PDF=48':>9}  {'PDF=43':>9}  {'PDF=145':>10}")
print(DASH)
for label, _, _ in TEST_VARIANTS:
    row = f"  {label:<52}"
    for portfolio in PORTFOLIOS:
        r = all_results[portfolio]["tests"][label]
        try:
            row += f"  {str(r['t']):>7}({r['diff']:>+3})"
        except:
            row += f"  {'ERR':>11}"
    print(row)
print(DASH)

# ── JQL reference for best approach ──────────────────────────────────────────
print(f"\n{SEP}")
print(f"  JQL REFERENCE  |  A4 + is-tested-by link filter  |  SNAP={SNAP}")
print(SEP)
dp = PORTFOLIOS["Data Platform"]["projects"]
print(f"\n  Stories (A4):\n    {stories_A4(dp)}")
print(f"\n  Tests (is tested by):\n    {tests_is_tested_by(dp)}")
print(f"\n  Tests (tests link):\n    {tests_tests_link(dp)}")
print(f"\n{SEP}")

# -*- coding: utf-8 -*-
"""
M3 — A4 stories + combined "is tested by" OR "tests" link filter
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

# A4 stories
def stories_A4(projects):
    return (f'{prj(projects)} AND issuetype = Story AND "Story Type" = Dev'
            f' AND status IN ("Accepted","Test Complete","Done")'
            f' AND resolved >= "{PI_FROM}" AND resolved <= "{SNAP} 23:59"')

# Inner story JQL for linkedIssuesOf
INNER = (f'issuetype = Story AND \\"Story Type\\" = Dev'
         f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
         f' AND resolved >= \'{PI_FROM}\' AND resolved <= \'{SNAP} 23:59\'')

def tests_is_tested_by(projects):
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{INNER}", "is tested by")')

def tests_tests_link(projects):
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{INNER}", "tests")')

def tests_combined(projects):
    # OR both link types — catches tests regardless of link direction
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND (issueFunction in linkedIssuesOf("{INNER}", "is tested by")'
            f' OR issueFunction in linkedIssuesOf("{INNER}", "tests"))')

print(SEP)
print(f"  M3 TEST:STORY RATIO  |  Combined Link Types  |  SNAP={SNAP}")
print(f"  PDF 04/10: DP=48/40   DS=43/21   DMS=145/37")
print(SEP)

results = {}
for portfolio, cfg in PORTFOLIOS.items():
    projects = cfg["projects"]
    print(f"\n  [{portfolio}]  PDF: Tests={cfg['pdf_tests']}  Stories={cfg['pdf_stories']}")

    s, valid, rem = run_safe(stories_A4, projects)
    if rem: print(f"    [skip invalid]: {', '.join(rem)}")

    t_itb,  _, _ = run_safe(tests_is_tested_by, valid)
    t_tst,  _, _ = run_safe(tests_tests_link,   valid)
    t_both, _, _ = run_safe(tests_combined,      valid)

    results[portfolio] = {
        "s": s, "itb": t_itb, "tst": t_tst, "both": t_both,
        "pdf_s": cfg["pdf_stories"], "pdf_t": cfg["pdf_tests"],
    }

    def fmt(t, pdf_t, s_val):
        try:
            ratio = round(int(t)/int(s_val), 2)
            diff  = f"{int(t)-pdf_t:+d}"
            return f"Tests={t}  Ratio={ratio}  Diff={diff}"
        except:
            return f"Tests={t}  Ratio=ERR  Diff=ERR"

    print(f"    Stories (A4):                    {s}  (PDF={cfg['pdf_stories']}  diff={int(s)-cfg['pdf_stories']:+d})")
    print(f"    is tested by:                    {fmt(t_itb,  cfg['pdf_tests'], s)}")
    print(f"    tests:                           {fmt(t_tst,  cfg['pdf_tests'], s)}")
    print(f"    COMBINED (is tested by OR tests): {fmt(t_both, cfg['pdf_tests'], s)}")

# ── Summary table ─────────────────────────────────────────────────────────────
print(f"\n\n{SEP}")
print(f"  FINAL SUMMARY  |  A4 Stories + Combined Link Types  |  SNAP={SNAP}")
print(SEP)
print(f"  {'Portfolio':<20}  {'PDF Stories':>12}  {'PDF Tests':>10}  {'Our Stories':>12}  {'is-tested-by':>13}  {'tests':>7}  {'COMBINED':>10}  {'CombDiff':>9}")
print(DASH)
for portfolio, r in results.items():
    try:
        s_diff   = f"{int(r['s'])-r['pdf_s']:+d}"
        itb_diff = f"{int(r['itb'])-r['pdf_t']:+d}"
        tst_diff = f"{int(r['tst'])-r['pdf_t']:+d}"
        both_diff= f"{int(r['both'])-r['pdf_t']:+d}"
        mark = "  <--" if abs(int(r['both'])-r['pdf_t']) <= 5 else ""
    except:
        s_diff = itb_diff = tst_diff = both_diff = "ERR"; mark = ""
    print(f"  {portfolio:<20}  {r['pdf_s']:>12}  {r['pdf_t']:>10}  "
          f"{str(r['s']):>10}({s_diff})  "
          f"{str(r['itb']):>10}({itb_diff})  "
          f"{str(r['tst']):>5}  "
          f"{str(r['both']):>8}({both_diff}){mark}")
print(DASH)

# ── JQL reference ─────────────────────────────────────────────────────────────
print(f"\n{SEP}")
print(f"  JQL REFERENCE — FINAL APPROACH  |  SNAP={SNAP}")
print(SEP)
dp = PORTFOLIOS["Data Platform"]["projects"]
print(f"\n  STORIES (A4 — resolved in PI + closed):")
print(f"    {stories_A4(dp)}")
print(f"\n  TESTS (combined 'is tested by' OR 'tests' link):")
print(f"    {tests_combined(dp)}")
print(f"\n{SEP}")

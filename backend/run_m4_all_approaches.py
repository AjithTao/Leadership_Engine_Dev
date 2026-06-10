# -*- coding: utf-8 -*-
"""
M4 Bug Discovery Ratio — All approaches x All 10 portfolios
Formula: Bugs Written in PI / Test Cases in PI  (expressed as %)
PDF 04/10/2026 reference values included for diff comparison.
SNAP=2026-04-10  PI_FROM=2026-04-01
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

# PDF reference values 04/10/2026
# Format: (pdf_tests, pdf_bugs)
PORTFOLIOS = {
    "Data Platform": {
        "projects": ["MDSICAP","MDSIA","OIP","MPSMOD","MPSUPDATES","AAP","AIVAPL","AIVA",
                     "ASYNCAPI","DNAST","DNASYND","EDPOEMI","MDSEDP","MDSMIG","OEMBD","TDI",
                     "TDO","TDOPS","TDP","TOB","TST","UDC","UDI"],
        "pdf_tests": 208, "pdf_bugs": 3,
    },
    "Data Solutions": {
        "projects": ["NDP","SSBYOD","DNACS","NPS","DNADEDGE","DNADDX","APITRON","DET","WRP"],
        "pdf_tests": 90, "pdf_bugs": 9,
    },
    "DMS": {
        "projects": ["APMODACC","ARMODACC","FSMODACC","MDWP","MODBETC","MODDWTC","MODPLAT","MODSRCH",
                     "MODTOOL","POMODACC","BRMODACC","ACC","FSACC","DRV","QTCLOUD","TRKMOD",
                     "TRKMISC","MODOEM","OEMI","PSRD"],
        "pdf_tests": 216, "pdf_bugs": 21,
    },
    "Fixed Ops": {
        "projects": ["FIX","FIXPRTSMKT","FIXPRTSORD","FXOPKIT","MODPRT","MPDS","SER","CDKSRVAPL",
                     "CDKSRVDAT","CDKSRVPLT","FXDOPSHT","FXDPSCN","PPR","CDKSRVAN","CDKSRVFRD","CDKSRVOEM",
                     "CSFM","FPE","FXDOPSDLM","FXDOPSQMS","FXOPSSRE","CDKSRVAPT","FXDOPSTOY","EUM",
                     "ADMSE","CDKSRVACC","FXDOPSAPT","FXDOPSINSP","ROS","CDKSRVLNI","PARTSDEV","SVEDRVE",
                     "ELESRV"],
        "pdf_tests": 290, "pdf_bugs": 28,
    },
    "Fortellis": {
        "projects": ["FORT","FORTAPPAPI","FORTQA","FORTCORE","FORTMP"],
        "pdf_tests": 1028, "pdf_bugs": 4,
    },
    "Inventory Management Solutions": {
        "projects": ["SM","CI","EDGEINV","ULI","CVC","MODVHCL"],
        "pdf_tests": 58, "pdf_bugs": 2,
    },
    "Modern Retail": {
        "projects": ["CCEL","CRMMYDAY","CRMP4S","EKC","ELCRMHE","ELCRMHT","ELDBD","ELEMRS",
                     "ELMOB","ELQAA","ELRPT","ELSCRM","ELSMOD","ELSRE","ELSTCAP","ELSUPPORT",
                     "ELSWEM","MRSSO","RM","ELDMSI","ELLRT","ELTPI","CRMAI","CDCDEB",
                     "ELDBAPR","ELDBCR","ELDBP","ELDBS","ELETL","CRMCM","DESKEL","MOD2SC",
                     "ELCOMT","ELDM","FRMSMOD","MRIX","OEDARWIN","OEGRDTETON","OEHIMALAYA","OEK2",
                     "OEKIRKJUFE","OET","OETWINMOU","OLYMPUS","CDESK","CREDIT","LDET","DC",
                     "MODTAI","MR","MRDRT","CSP","HW","EFORM","GCMT","FI",
                     "KEYSTONE","MODSFI","LIEN","MODTAO","CSMSGISSUE","CCPADMIN","CCPAPPS","CCPBKND",
                     "CCPDATA","CCPTXT","MRC2","CC"],
        "pdf_tests": 415, "pdf_bugs": 22,
    },
    "Payments": {
        "projects": ["EPAYTEAM","CDKPAY","CDKPAYIN","CDKPAYM"],
        "pdf_tests": 76, "pdf_bugs": 1,
    },
    "Shared Services": {
        "projects": ["CA","CDS","CDCM","CNV","USA","CAM","EIS","FSRE",
                     "IAM","DNADD","MRCANON","GS","RDSDEV","CAR"],
        "pdf_tests": 157, "pdf_bugs": 2,
    },
    "Title & Registration-CVR": {
        "projects": ["CVRS","CVRCACONV","CVRCBE","CVRCFE","CVRAL","CVRHOST","CVRIN","CVRMA",
                     "CVRMD","CVRNC","CVRPA","CVRRC","CVRSC","CVRVA","CVRWV","CVRFL",
                     "CVRGA","CVRIL","CVRILSUP","CVRCH","CVRCIS","CVRCLA","CVRDAESIGN","CVRDOCIMG",
                     "CVRNMVTI","CVRMIWEB","CVRNCC","CVRNJ","CVRNY","CVRPAC","WICON"],
        "pdf_tests": 1035, "pdf_bugs": 8,
    },
}

SEP  = "=" * 130
DASH = "-" * 130

def run_jql(jql):
    payload = json.dumps({"jql": jql, "maxResults": 0, "fields": ["key"]}).encode()
    req = urllib.request.Request(f"{JIRA_URL}/rest/api/2/search",
                                 data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
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
            return f"ERR", valid, removed
    return "ERR", [], removed

def prj(projects):
    return f'project IN ({",".join(chr(34)+p+chr(34) for p in projects)})'

# ── Bug JQL approaches ────────────────────────────────────────────────────────
def bugs_B1(p):
    """Bugs created in PI (issuetype = Bug only)"""
    return f'{prj(p)} AND issuetype = Bug AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'

def bugs_B2(p):
    """Bugs+Defects created in PI"""
    return f'{prj(p)} AND issuetype IN (Bug, Defect) AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'

def bugs_B3(p):
    """Bugs created in PI, exclude Abandoned"""
    return f'{prj(p)} AND issuetype = Bug AND status NOT IN (Abandoned) AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'

# ── Test Case JQL approaches ──────────────────────────────────────────────────
def tests_T1(p):
    """All tests created in PI, status NOT IN Abandoned"""
    return (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"')

def tests_T2(p):
    """Tests linked to Story/Bug/Defect created in PI (linkedIssuesOf, no link type)"""
    inner = f"issuetype IN (Story, Bug, Defect) AND created >= '{PI_FROM}' AND created <= '{SNAP} 23:59'"
    return (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{inner}")')

def tests_T3(p):
    """Tests linked to Dev Story/Bug/Defect created in PI (Dev stories only)"""
    inner = (f'(issuetype = Story AND \\"Story Type\\" = Dev OR issuetype IN (Bug, Defect))'
             f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP} 23:59\'')
    return (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{inner}")')

def tests_T4(p):
    """Tests linked to closed Dev stories in PI (A4/M3 approach — is tested by)"""
    inner = (f'issuetype = Story AND \\"Story Type\\" = Dev'
             f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
             f' AND resolved >= \'{PI_FROM}\' AND resolved <= \'{SNAP} 23:59\'')
    return (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{inner}", "is tested by")')

def tests_T5(p):
    """Tests created in PI OR linked to any Story/Bug/Defect in PI (broadest)"""
    inner = f"issuetype IN (Story, Bug, Defect) AND created >= '{PI_FROM}' AND created <= '{SNAP} 23:59'"
    return (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND (created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
            f' OR issueFunction in linkedIssuesOf("{inner}"))')

def tests_T6(p):
    """Tests linked to any Story/Bug/Defect (no date filter on work items)"""
    inner = "issuetype IN (Story, Bug, Defect)"
    return (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
            f' AND issueFunction in linkedIssuesOf("{inner}")')

BUG_APPROACHES = [
    ("B1: Bug only, created in PI",          bugs_B1),
    ("B2: Bug+Defect, created in PI",        bugs_B2),
    ("B3: Bug only, created in PI, !Abandon",bugs_B3),
]

TEST_APPROACHES = [
    ("T1: All Tests created in PI",                    tests_T1),
    ("T2: Tests linked Story/Bug/Def created in PI",   tests_T2),
    ("T3: Tests linked Dev+Bug/Def created in PI",     tests_T3),
    ("T4: Tests is-tested-by closed Dev stories (M3)", tests_T4),
    ("T5: Tests created OR linked (broadest)",         tests_T5),
    ("T6: Tests created in PI + linked any work item", tests_T6),
]

print(SEP)
print(f"  M4 Bug Discovery Ratio  |  All Portfolios x All Approaches  |  SNAP={SNAP}")
print(f"  Formula: Bugs / Test Cases  (as %)")
print(SEP)

# ── Per-portfolio detailed results ────────────────────────────────────────────
all_results = {}
for portfolio, cfg in PORTFOLIOS.items():
    projects = cfg["projects"]
    pdf_t = cfg["pdf_tests"]
    pdf_b = cfg["pdf_bugs"]
    pdf_ratio = round(pdf_b / pdf_t * 100, 2) if pdf_t else 0

    print(f"\n  [{portfolio}]  PDF: Tests={pdf_t}  Bugs={pdf_b}  Ratio={pdf_ratio}%")

    # Bugs
    bug_counts = {}
    for label, fn in BUG_APPROACHES:
        b, valid_b, rem_b = run_safe(fn, projects)
        bug_counts[label] = {"val": b, "valid": valid_b}
        try:
            diff = f"{int(b)-pdf_b:+d}"
        except:
            diff = "ERR"
        print(f"    {label:<45}  Bugs={str(b):<6}  Diff={diff}")

    # Tests (using valid projects from B1 as base)
    _, valid_p, rem_p = run_safe(bugs_B1, projects)
    if rem_p:
        print(f"    [invalid projects removed]: {', '.join(rem_p)}")

    test_counts = {}
    for label, fn in TEST_APPROACHES:
        t, _, _ = run_safe(fn, valid_p)
        test_counts[label] = t
        try:
            diff = f"{int(t)-pdf_t:+d}"
            mark = "  <--" if abs(int(t)-pdf_t) <= 5 else ""
        except:
            diff = "ERR"; mark = ""
        print(f"    {label:<45}  Tests={str(t):<6}  Diff={diff}{mark}")

    all_results[portfolio] = {
        "pdf_t": pdf_t, "pdf_b": pdf_b, "pdf_ratio": pdf_ratio,
        "bugs": bug_counts, "tests": test_counts, "valid": valid_p,
    }

# ── Summary: Tests comparison ─────────────────────────────────────────────────
print(f"\n\n{SEP}")
print(f"  SUMMARY — TEST COUNTS vs PDF  |  SNAP={SNAP}")
print(SEP)
hdr = f"  {'Approach':<47}"
for pf in PORTFOLIOS:
    short = pf[:12]
    hdr += f"  {short:>14}"
print(hdr)
pdf_row = f"  {'PDF Reference':<47}"
for pf, cfg in PORTFOLIOS.items():
    pdf_row += f"  {str(cfg['pdf_tests']):>14}"
print(pdf_row)
print(DASH)
for label, _ in TEST_APPROACHES:
    row = f"  {label:<47}"
    for pf, r in all_results.items():
        t = r["tests"].get(label, "ERR")
        pdf_t = r["pdf_t"]
        try:
            diff = f"{int(t)-pdf_t:+d}"
            row += f"  {str(t):>7}({diff:>+4})"
        except:
            row += f"  {'ERR':>14}"
    print(row)
print(DASH)

# ── Summary: Bugs comparison ──────────────────────────────────────────────────
print(f"\n{SEP}")
print(f"  SUMMARY — BUG COUNTS vs PDF  |  SNAP={SNAP}")
print(SEP)
hdr2 = f"  {'Approach':<47}"
for pf in PORTFOLIOS:
    short = pf[:12]
    hdr2 += f"  {short:>14}"
print(hdr2)
pdf_row2 = f"  {'PDF Reference':<47}"
for pf, cfg in PORTFOLIOS.items():
    pdf_row2 += f"  {str(cfg['pdf_bugs']):>14}"
print(pdf_row2)
print(DASH)
for label, _ in BUG_APPROACHES:
    row = f"  {label:<47}"
    for pf, r in all_results.items():
        b = r["bugs"].get(label, {}).get("val", "ERR")
        pdf_b = r["pdf_b"]
        try:
            diff = f"{int(b)-pdf_b:+d}"
            row += f"  {str(b):>7}({diff:>+4})"
        except:
            row += f"  {'ERR':>14}"
    print(row)
print(DASH)

# ── Best ratio combination table ──────────────────────────────────────────────
print(f"\n{SEP}")
print(f"  RATIO TABLE — B1 Bugs x All Test Approaches  |  SNAP={SNAP}")
print(f"  (Ratio = Bugs/Tests * 100%,  showing diff from PDF ratio)")
print(SEP)
for portfolio, r in all_results.items():
    b = r["bugs"].get("B1: Bug only, created in PI", {}).get("val", "ERR")
    pdf_b = r["pdf_b"]
    pdf_t = r["pdf_t"]
    pdf_ratio = r["pdf_ratio"]
    print(f"\n  [{portfolio}]  PDF: Bugs={pdf_b}  Tests={pdf_t}  Ratio={pdf_ratio}%  |  OurBugs(B1)={b}")
    print(f"  {'Test Approach':<47}  {'Tests':>7}  {'Ratio%':>8}  {'RatioDiff':>10}  {'BugDiff':>8}")
    print(f"  {'-'*85}")
    for tlabel, _ in TEST_APPROACHES:
        t = r["tests"].get(tlabel, "ERR")
        try:
            ratio_pct = round(int(b) / int(t) * 100, 2)
            ratio_diff = round(ratio_pct - pdf_ratio, 2)
            bdiff = f"{int(b)-pdf_b:+d}"
            mark = "  <--" if abs(ratio_diff) <= 0.5 else ""
        except:
            ratio_pct = ratio_diff = bdiff = "ERR"; mark = ""
        print(f"  {tlabel:<47}  {str(t):>7}  {str(ratio_pct):>8}  {str(ratio_diff):>10}{mark}  {str(bdiff):>8}")
print(f"\n{SEP}")

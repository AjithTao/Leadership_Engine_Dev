# -*- coding: utf-8 -*-
"""
Locked-In Approaches Validation Report
M2 Test Case Review Status | M3 Test:Story Ratio | M4 Bug Discovery Ratio
Portfolios: Data Platform, Data Solutions, DMS, Fixed Ops
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

# PDF reference values 04/10/2026   None = not available in PDF shared
PORTFOLIOS = {
    "Data Platform": {
        "projects": ["MDSICAP","MDSIA","OIP","MPSUPDATES","MPSMOD","AAP","AIVAPL","MDMCOGS",
                     "AIVA","ASYNCAPI","DNASYND","DPREQ","DNAST","EDPOEMI","MDSMIG","MDSEDP",
                     "TDO","TDOPS","TDP","TDQ","UDC","UDI"],
        "m2_pdf": 20, "m3_pdf_tests": 48, "m3_pdf_stories": 40,
        "m4_pdf_tests": 208, "m4_pdf_bugs": 3,
    },
    "Data Solutions": {
        "projects": ["NDP","NPS","DNADEDGE","APITRON","DET","WRAAP","WRP"],
        "m2_pdf": 17, "m3_pdf_tests": 43, "m3_pdf_stories": 21,
        "m4_pdf_tests": 90, "m4_pdf_bugs": 9,
    },
    "DMS": {
        "projects": ["ARMODACC","AIMODACC","APMODACC","FSMODACC","GLMODACC","POMODACC",
                     "MODACCRPTS","MODSET","YEMODACC","MODBETC","MODSRCH","MODDWTC","MDWP",
                     "MODPLAT","MODTOOL","BRMODACC","ACC","FSACC","DRV","MGDIT","PKM",
                     "SODRV","TRKMOD","TRKMISC","MODOEM","OEMI","PSRD"],
        "m2_pdf": 21, "m3_pdf_tests": 145, "m3_pdf_stories": 37,
        "m4_pdf_tests": 216, "m4_pdf_bugs": 21,
    },
    "Fixed Ops": {
        "projects": ["FXOPKIT","FIXPRTSMKT","FIXPRTSORD","FIX","MPDS","SER","CDKSRVAPL",
                     "CDKSRVDAT","CDKSRVPLT","FXDOPSHT","PPR","CDKSRVAN","CDKSRVFRD","CDKSRVOEM",
                     "FPE","FXOPSSRE","FXDOPSQMS","FXDOPSDLM","CDKSRVAPT","FXDOPSTOY","ADMSE",
                     "CDKSRVACC","FXDOPSAPT","FXDOPSINSP","CDKSRVLNI","PARTSDEV","SVEDRVE","ELESRV"],
        "m2_pdf": 78, "m3_pdf_tests": 213, "m3_pdf_stories": 86,
        "m4_pdf_tests": 290, "m4_pdf_bugs": 28,
    },
}

SEP   = "=" * 120
DASH  = "-" * 120
THIN  = "-" * 60

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
            return "ERR", valid, removed
    return "ERR", [], removed

def prj(p):
    return f'project IN ({",".join(chr(34)+x+chr(34) for x in p)})'

def diff_str(val, ref):
    if ref is None: return "N/A (no PDF)"
    try:
        return f"{int(val)-int(ref):+d}"
    except:
        return "ERR"

def ratio_diff_str(val, ref):
    if ref is None: return "N/A"
    try:
        return f"{round(float(val)-float(ref), 2):+.2f}"
    except:
        return "ERR"

# ═══════════════════════════════════════════════════════════════════════════════
# JQL BUILDERS
# ═══════════════════════════════════════════════════════════════════════════════

# ── M2: Test Case Review Status ───────────────────────────────────────────────
def m2_old_jql(p):
    """OLD: created in PI + status IN (Accepted, Test Complete, Done) + resolved <= snap"""
    return (f'{prj(p)} AND issuetype = Story AND "Story Type" = Dev'
            f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
            f' AND status IN ("Accepted", "Test Complete", "Done")'
            f' AND resolved <= "{SNAP} 23:59"')

def m2_new_jql(p):
    """NEW (A5): created in PI + status NOT IN (Abandoned) + resolved <= snap"""
    return (f'{prj(p)} AND issuetype = Story AND "Story Type" = Dev'
            f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
            f' AND status NOT IN (Abandoned)'
            f' AND resolved <= "{SNAP} 23:59"')

# ── M3: Test:Story Ratio — Stories ────────────────────────────────────────────
def m3_stories_old_jql(p):
    """OLD: created in PI + status closed + resolved <= snap"""
    return (f'{prj(p)} AND issuetype = Story AND "Story Type" = Dev'
            f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
            f' AND status IN ("Accepted", "Test Complete", "Done")'
            f' AND resolved <= "{SNAP} 23:59"')

def m3_stories_new_jql(p):
    """NEW (A4): resolved in PI window + status closed (no created filter)"""
    return (f'{prj(p)} AND issuetype = Story AND "Story Type" = Dev'
            f' AND status IN ("Accepted", "Test Complete", "Done")'
            f' AND resolved >= "{PI_FROM}" AND resolved <= "{SNAP} 23:59"')

# ── M3: Test:Story Ratio — Tests ─────────────────────────────────────────────
def m3_tests_old_jql(p):
    """OLD: Tests linked to Story/Bug/Defect created in PI (no Dev filter, no link type)"""
    inner = f"issuetype IN (Story, Bug, Defect) AND created >= '{PI_FROM}' AND created <= '{SNAP} 23:59'"
    return (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{inner}")')

def m3_tests_new_jql(p):
    """NEW: Tests linked via 'is tested by' to closed Dev stories resolved in PI"""
    inner = (f'issuetype = Story AND \\"Story Type\\" = Dev'
             f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
             f' AND resolved >= \'{PI_FROM}\' AND resolved <= \'{SNAP} 23:59\'')
    return (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{inner}", "is tested by")')

# ── M4: Bug Discovery — Tests ─────────────────────────────────────────────────
def m4_tests_old_jql(p):
    """OLD: Tests linked to Story/Bug/Defect created in PI (no Dev story filter)"""
    inner = f"issuetype IN (Story, Bug, Defect) AND created >= '{PI_FROM}' AND created <= '{SNAP} 23:59'"
    return (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{inner}")')

def m4_tests_new_jql(p):
    """NEW (T3): Tests linked to Dev-Story OR Bug/Defect created in PI"""
    inner = (f'(issuetype = Story AND \\"Story Type\\" = Dev OR issuetype IN (Bug, Defect))'
             f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP} 23:59\'')
    return (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{inner}")')

# ── M4: Bug Discovery — Bugs ──────────────────────────────────────────────────
def m4_bugs_jql(p):
    """Bugs created in PI (unchanged from original)"""
    return f'{prj(p)} AND issuetype = Bug AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'


# ═══════════════════════════════════════════════════════════════════════════════
# PRINT JQL REFERENCE SECTION
# ═══════════════════════════════════════════════════════════════════════════════
print(SEP)
print("  JQL REFERENCE — OLD vs NEW for all 3 Metrics")
print(SEP)

print("""
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  M2 — Test Case Review Status (Closed Dev Stories)                         │
  └─────────────────────────────────────────────────────────────────────────────┘
  OLD JQL:
    {project_filter}
    AND issuetype = Story AND "Story Type" = Dev
    AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"
    AND status IN ("Accepted", "Test Complete", "Done")
    AND resolved <= "{SNAP} 23:59"

  NEW JQL (A5 — LOCKED IN):
    {project_filter}
    AND issuetype = Story AND "Story Type" = Dev
    AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"
    AND status NOT IN (Abandoned)                  ← CHANGED: broader status filter
    AND resolved <= "{SNAP} 23:59"

  KEY CHANGE: status IN (Accepted, Test Complete, Done)  →  status NOT IN (Abandoned)
              Captures more closed states beyond just those 3 hardcoded values
""")

print("""  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  M3 — Test:Story Ratio                                                      │
  └─────────────────────────────────────────────────────────────────────────────┘
  STORIES denominator:
  OLD JQL:
    {project_filter}
    AND issuetype = Story AND "Story Type" = Dev
    AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"   ← had created filter
    AND status IN ("Accepted", "Test Complete", "Done")
    AND resolved <= "{SNAP} 23:59"                              ← only upper bound

  NEW JQL (A4 — LOCKED IN):
    {project_filter}
    AND issuetype = Story AND "Story Type" = Dev
    AND status IN ("Accepted", "Test Complete", "Done")
    AND resolved >= "{PI_FROM}"                                 ← ADDED: lower bound
    AND resolved <= "{SNAP} 23:59"                              ← KEPT: upper bound
    [NO created filter]                                         ← REMOVED

  KEY CHANGE: Removed created filter; anchored entirely on resolved-in-PI window

  TESTS numerator:
  OLD JQL:
    {project_filter}
    AND issuetype = Test AND status NOT IN (Abandoned)
    AND issueFunction in linkedIssuesOf(
      "issuetype IN (Story, Bug, Defect)               ← included Bug/Defect
       AND created >= 'PI_FROM' AND created <= 'SNAP'")
    [no link type specified]

  NEW JQL (is-tested-by — LOCKED IN):
    {project_filter}
    AND issuetype = Test AND status NOT IN (Abandoned)
    AND issueFunction in linkedIssuesOf(
      "issuetype = Story AND \\"Story Type\\" = Dev     ← Dev stories only
       AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")
       AND resolved >= 'PI_FROM' AND resolved <= 'SNAP'",
      "is tested by")                                  ← ADDED: link type filter

  KEY CHANGES: Dev stories only; resolved date (not created); "is tested by" link type
""")

print("""  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  M4 — Bug Discovery Ratio                                                   │
  └─────────────────────────────────────────────────────────────────────────────┘
  TESTS denominator:
  OLD JQL:
    {project_filter}
    AND issuetype = Test AND status NOT IN (Abandoned)
    AND issueFunction in linkedIssuesOf(
      "issuetype IN (Story, Bug, Defect)               ← no Dev story filter
       AND created >= 'PI_FROM' AND created <= 'SNAP'")

  NEW JQL (T3 — LOCKED IN):
    {project_filter}
    AND issuetype = Test AND status NOT IN (Abandoned)
    AND issueFunction in linkedIssuesOf(
      "(issuetype = Story AND \\"Story Type\\" = Dev    ← Dev stories specifically
        OR issuetype IN (Bug, Defect))                  ← plus Bug/Defect
       AND created >= 'PI_FROM' AND created <= 'SNAP'")

  KEY CHANGE: Explicit Dev story filter added; still includes Bug/Defect work items

  BUGS numerator: UNCHANGED
    {project_filter}
    AND issuetype = Bug
    AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"
""")

# ═══════════════════════════════════════════════════════════════════════════════
# RUN QUERIES
# ═══════════════════════════════════════════════════════════════════════════════
print(SEP)
print(f"  LIVE RESULTS — SNAP={SNAP}  PI_FROM={PI_FROM}")
print(SEP)

results = {}
for portfolio, cfg in PORTFOLIOS.items():
    projects = cfg["projects"]
    print(f"\n  Querying [{portfolio}]...", flush=True)

    # Get valid projects once
    _, valid, rem = run_safe(lambda p: f'{prj(p)} AND issuetype = Story ORDER BY created DESC', projects)
    if rem:
        print(f"    [removed {len(rem)} invalid projects: {', '.join(rem[:5])}{'...' if len(rem)>5 else ''}]")

    # M2
    m2_old, _, _ = run_safe(m2_old_jql, valid)
    m2_new, _, _ = run_safe(m2_new_jql, valid)

    # M3 stories
    m3s_old, _, _ = run_safe(m3_stories_old_jql, valid)
    m3s_new, _, _ = run_safe(m3_stories_new_jql, valid)

    # M3 tests
    m3t_old, _, _ = run_safe(m3_tests_old_jql, valid)
    m3t_new, _, _ = run_safe(m3_tests_new_jql, valid)

    # M4
    m4t_old, _, _ = run_safe(m4_tests_old_jql, valid)
    m4t_new, _, _ = run_safe(m4_tests_new_jql, valid)
    m4b,     _, _ = run_safe(m4_bugs_jql,      valid)

    results[portfolio] = {
        "m2_old": m2_old, "m2_new": m2_new,
        "m3s_old": m3s_old, "m3s_new": m3s_new,
        "m3t_old": m3t_old, "m3t_new": m3t_new,
        "m4t_old": m4t_old, "m4t_new": m4t_new,
        "m4b": m4b,
        "cfg": cfg, "valid": valid,
    }
    print(f"    Done.", flush=True)

# ═══════════════════════════════════════════════════════════════════════════════
# FINAL REPORT
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n\n{SEP}")
print(f"  FINAL DIFF REPORT  |  Old vs New vs PDF  |  SNAP={SNAP}")
print(SEP)

for portfolio, r in results.items():
    cfg  = r["cfg"]
    print(f"\n  ┌{'─'*80}┐")
    print(f"  │  {portfolio:<78}│")
    print(f"  └{'─'*80}┘")

    # ── M2 ────────────────────────────────────────────────────────────────────
    m2_pdf = cfg["m2_pdf"]
    m2_old = r["m2_old"]
    m2_new = r["m2_new"]
    try:
        m2_old_diff = diff_str(m2_old, m2_pdf)
        m2_new_diff = diff_str(m2_new, m2_pdf)
        m2_mark = "✓ CLOSER" if m2_pdf and abs(int(m2_new)-m2_pdf) < abs(int(m2_old)-m2_pdf) else ""
    except:
        m2_old_diff = m2_new_diff = "ERR"; m2_mark = ""

    print(f"\n  M2 — Test Case Review Status (Closed Dev Stories)")
    print(f"    PDF         : {m2_pdf if m2_pdf else 'N/A'}")
    print(f"    OLD (A1)    : {m2_old:<6}  Diff vs PDF: {m2_old_diff}")
    print(f"    NEW (A5) ★  : {m2_new:<6}  Diff vs PDF: {m2_new_diff}  {m2_mark}")

    # ── M3 ────────────────────────────────────────────────────────────────────
    m3_pdf_s = cfg["m3_pdf_stories"]
    m3_pdf_t = cfg["m3_pdf_tests"]
    m3s_old  = r["m3s_old"]
    m3s_new  = r["m3s_new"]
    m3t_old  = r["m3t_old"]
    m3t_new  = r["m3t_new"]

    try:
        m3_ratio_old = round(int(m3t_old)/int(m3s_old), 2) if int(m3s_old) > 0 else 0
        m3_ratio_new = round(int(m3t_new)/int(m3s_new), 2) if int(m3s_new) > 0 else 0
        m3_ratio_pdf = round(m3_pdf_t/m3_pdf_s, 2) if m3_pdf_t and m3_pdf_s else None
    except:
        m3_ratio_old = m3_ratio_new = m3_ratio_pdf = "ERR"

    print(f"\n  M3 — Test:Story Ratio")
    print(f"    {'':18}  {'Stories':>8}  {'Tests':>8}  {'Ratio':>7}  {'S-Diff':>8}  {'T-Diff':>8}  {'R-Diff':>8}")
    print(f"    {'─'*75}")
    print(f"    {'PDF Ref':18}  {str(m3_pdf_s) if m3_pdf_s else 'N/A':>8}  "
          f"{str(m3_pdf_t) if m3_pdf_t else 'N/A':>8}  "
          f"{str(m3_ratio_pdf) if m3_ratio_pdf else 'N/A':>7}  {'---':>8}  {'---':>8}  {'---':>8}")
    print(f"    {'OLD JQL':18}  {str(m3s_old):>8}  {str(m3t_old):>8}  {str(m3_ratio_old):>7}  "
          f"{diff_str(m3s_old, m3_pdf_s):>8}  {diff_str(m3t_old, m3_pdf_t):>8}  "
          f"{ratio_diff_str(m3_ratio_old, m3_ratio_pdf):>8}")
    print(f"    {'NEW JQL ★':18}  {str(m3s_new):>8}  {str(m3t_new):>8}  {str(m3_ratio_new):>7}  "
          f"{diff_str(m3s_new, m3_pdf_s):>8}  {diff_str(m3t_new, m3_pdf_t):>8}  "
          f"{ratio_diff_str(m3_ratio_new, m3_ratio_pdf):>8}")

    # ── M4 ────────────────────────────────────────────────────────────────────
    m4_pdf_t = cfg["m4_pdf_tests"]
    m4_pdf_b = cfg["m4_pdf_bugs"]
    m4t_old  = r["m4t_old"]
    m4t_new  = r["m4t_new"]
    m4b      = r["m4b"]

    try:
        m4_pdf_ratio   = round(m4_pdf_b / m4_pdf_t * 100, 2) if m4_pdf_t else None
        m4_ratio_old   = round(int(m4b)  / int(m4t_old) * 100, 2) if int(m4t_old) > 0 else 0
        m4_ratio_new   = round(int(m4b)  / int(m4t_new) * 100, 2) if int(m4t_new) > 0 else 0
    except:
        m4_pdf_ratio = m4_ratio_old = m4_ratio_new = "ERR"

    print(f"\n  M4 — Bug Discovery Ratio  (Bugs / Tests × 100%)")
    print(f"    {'':18}  {'Tests':>8}  {'Bugs':>6}  {'Ratio%':>8}  {'T-Diff':>8}  {'B-Diff':>8}  {'R-Diff':>8}")
    print(f"    {'─'*75}")
    print(f"    {'PDF Ref':18}  {str(m4_pdf_t):>8}  {str(m4_pdf_b):>6}  "
          f"{str(m4_pdf_ratio)+'%' if m4_pdf_ratio else 'N/A':>8}  {'---':>8}  {'---':>8}  {'---':>8}")
    print(f"    {'OLD JQL':18}  {str(m4t_old):>8}  {str(m4b):>6}  {str(m4_ratio_old)+'%':>8}  "
          f"{diff_str(m4t_old, m4_pdf_t):>8}  {diff_str(m4b, m4_pdf_b):>8}  "
          f"{ratio_diff_str(m4_ratio_old, m4_pdf_ratio):>8}")
    print(f"    {'NEW JQL ★':18}  {str(m4t_new):>8}  {str(m4b):>6}  {str(m4_ratio_new)+'%':>8}  "
          f"{diff_str(m4t_new, m4_pdf_t):>8}  {diff_str(m4b, m4_pdf_b):>8}  "
          f"{ratio_diff_str(m4_ratio_new, m4_pdf_ratio):>8}")

print(f"\n\n{SEP}")
print(f"  SUMMARY TABLE — New JQL vs PDF (all metrics, all portfolios)  |  SNAP={SNAP}")
print(SEP)
print(f"  {'Portfolio':<28}  {'M2 Stories':>12}  {'M3 Ratio':>10}  {'M3 S-Diff':>10}  {'M3 T-Diff':>10}  {'M4 Tests':>10}  {'M4 Bugs':>8}  {'M4 Ratio%':>10}")
print(DASH)
for portfolio, r in results.items():
    cfg = r["cfg"]
    m2_new = r["m2_new"]
    m3s_new = r["m3s_new"]
    m3t_new = r["m3t_new"]
    m4t_new = r["m4t_new"]
    m4b = r["m4b"]
    try:
        m3_ratio_new = round(int(m3t_new)/int(m3s_new), 2) if int(m3s_new) > 0 else 0
        m4_ratio_new = round(int(m4b)/int(m4t_new)*100, 2) if int(m4t_new) > 0 else 0
    except:
        m3_ratio_new = m4_ratio_new = "ERR"

    def _c(v, pdf): return diff_str(v, pdf) if pdf else "N/A"
    print(f"  {portfolio:<28}  {str(m2_new):>6}({_c(m2_new, cfg['m2_pdf']):>5})  "
          f"{str(m3_ratio_new):>10}  "
          f"{_c(m3s_new, cfg['m3_pdf_stories']):>10}  "
          f"{_c(m3t_new, cfg['m3_pdf_tests']):>10}  "
          f"{str(m4t_new):>6}({_c(m4t_new, cfg['m4_pdf_tests']):>5})  "
          f"{str(m4b):>4}({_c(m4b, cfg['m4_pdf_bugs']):>3})  "
          f"{str(m4_ratio_new)+'%':>10}")
print(DASH)
print(f"\n  ★ = Locked-in new approach  |  Diff = Our_value - PDF_value  |  N/A = PDF not provided")
print(f"\n{SEP}")

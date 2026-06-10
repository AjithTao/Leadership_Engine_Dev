# -*- coding: utf-8 -*-
"""
TCR All Portfolios — Approach 1 vs Approach 5
PI2 CY26: PI_FROM=2026-04-01, SNAP=2026-05-25
Invalid project keys are auto-removed and retried.
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
    "Data Platform": [
        "MDSICAP","MDSIA","OIP","MPSUPDATES","MPSMOD","AAP","AIVAPL","MDMCOGS",
        "AIVA","ASYNCAPI","DNASYND","DPREQ","DNAST","EDPOEMI","MDSMIG","MDSEDP",
        "TDO","TDOPS","TDP","TDQ","UDC","UDI",
    ],
    "Data Solutions": [
        "NDP","NPS","DNADEDGE","APITRON","DET","WRAAP","WRP",
    ],
    "DMS": [
        "ARMODACC","AIMODACC","APMODACC","FSMODACC","GLMODACC","POMODACC",
        "MODACCRPTS","MODSET","YEMODACC","MODBETC","MODSRCH","MODDWTC","MDWP",
        "MODPLAT","MODTOOL","BRMODACC","ACC","FSACC","DRV","MGDIT","PKM",
        "SODRV","TRKMOD","TRKMISC","MODOEM","OEMI","PSRD",
    ],
    "Fixed Ops": [
        "FXOPKIT","FIXPRTSMKT","FIXPRTSORD","FIX","MPDS","SER","CDKSRVAPL",
        "CDKSRVDAT","CDKSRVPLT","FXDOPSHT","PPR","CDKSRVAN","CDKSRVFRD",
        "CDKSRVOEM","FPE","FXOPSSRE","FXDOPSQMS","FXDOPSDLM","CDKSRVAPT",
        "FXDOPSTOY","ADMSE","CDKSRVACC","FXDOPSAPT","FXDOPSINSP","CDKSRVLNI",
        "PARTSDEV","SVEDRVE","ELESRV",
    ],
    "Fortellis": [
        "FORT","FORTAPPAPI","FORTDOCS","FORTQA","FORTUX","FORTMP",
    ],
    "Modern Retail": [
        "CCEL","CRMMYDAY","UXCRM","CRMV","ELSCRM","ELDBD","ELSDEVOPS","ELEMRS",
        "ELPCR","ELQAA","ELSWEM","ELSMOD","ELSUPPORT","ELSRE","EKC","ELMOB",
        "CRMP4S","MRSSO","RM","ELDMSI","ELTPI","ELLRT","CRMAI","CCSUP","CDCDEB",
        "ELETL","ELDBCR","ELDBAPR","ELDBS","ELDBP","CRMCM","DESKEL","MOD2SC",
        "ELCOMT","ELDM","FRMSMOD","MRIX","OEC","OETWINMOU","OEDARWIN","OEK2",
        "OEKIRKJUFE","OLYMPUS","OET","CREDIT","DELIVERY","DC","MODTAI","MR",
        "MRDRT","CSP","HW","EFORM","GCMT","FI","KEYSTONE","MODSFI","LIEN",
        "MODTAO","CCPADMIN","CCPAPPS","CCPDATA","CCPBKND","CCPTXT","CC",
    ],
    "Network & Communication Services": [
        "PROTON","COL","COLLAB","VCI",
    ],
    "Payments": [
        "EPAYTEAM","CDKPAY","CDKPAYIN","CDKPAYM",
    ],
    "Shared Services": [
        "CA","CDS","CDCM","CNV","USA","CAM","EIS","FSRE","IAM","DNADD",
        "MRCANON","GS","RDS","RDSDEV","MODUX","CAR","EDGEINV","CVC","MODVHCL",
    ],
    "Title & Registration-CVR": [
        "CVRS","CVRCACONV","CVRCBE","CVRWV","CVRVA","CVRSC","CVRPA","CVRMD",
        "CVRMA","CVRIN","CVRHOST","CVRFL","CVRGA","CVRIL","CVRCIS","CVRCH",
        "CVRCLA","CVRDAESIGN","CVRDOCIMG","CVRNMVTI","CVRMIWEB","CVRNCC",
        "CVRNJ","CVRPAC","WICON",
    ],
}

SEP  = "=" * 120
DASH = "-" * 120

# ── Jira helpers ─────────────────────────────────────────────────────────────

def run_jql(jql):
    """Returns (count_or_ERR_string, error_message_or_None)."""
    payload = json.dumps({"jql": jql, "maxResults": 0, "fields": ["key"]}).encode()
    req = urllib.request.Request(f"{JIRA_URL}/rest/api/2/search",
                                 data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.loads(r.read()).get("total", "ERR"), None
    except urllib.request.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8", errors="replace"))
            msgs = body.get("errorMessages", []) + list(body.get("errors", {}).values())
            return "ERR", " | ".join(str(x) for x in msgs)
        except Exception:
            return "ERR", str(e)
    except Exception as e:
        return "ERR", str(e)


def bad_project_from_error(err_msg):
    """Extract invalid project key from Jira error message."""
    if not err_msg:
        return None
    # "The value 'KEY' does not exist for the field 'project'."
    m = re.search(r"[Tt]he value '([A-Z0-9]+)' does not exist for the field 'project'", err_msg)
    if m:
        return m.group(1)
    # "A value with ID 'KEY' does not exist for the field 'project'."
    m = re.search(r"'([A-Z0-9]+)' does not exist", err_msg)
    if m:
        return m.group(1)
    return None


def run_portfolio(projects, jql_builder):
    """Run JQL for a portfolio, auto-removing invalid project keys on error."""
    valid   = list(projects)
    removed = []
    while valid:
        total, err = run_jql(jql_builder(valid))
        if err is None:
            return total, valid, removed
        bad = bad_project_from_error(err)
        if bad and bad in valid:
            valid.remove(bad)
            removed.append(bad)
            print(f"      [skip invalid] {bad}", flush=True)
        else:
            # Can't recover — return the error
            return f"ERR", valid, removed
    return "ERR", [], removed


# ── JQL builders ─────────────────────────────────────────────────────────────

def a1_jql(projects):
    p = ",".join(f'"{x}"' for x in projects)
    return (f'project IN ({p}) AND issuetype = Story AND "Story Type" = Dev'
            f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
            f' AND status IN ("Accepted","Test Complete","Done")'
            f' AND resolved <= "{SNAP} 23:59"')

def a5_jql(projects):
    p = ",".join(f'"{x}"' for x in projects)
    return (f'project IN ({p}) AND issuetype = Story AND "Story Type" = Dev'
            f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
            f' AND status NOT IN (Abandoned)'
            f' AND resolved <= "{SNAP} 23:59"')

def yes_suffix():
    return ' AND "Test Case Reviewed" = Yes'


# ── Main collection loop ─────────────────────────────────────────────────────

print(SEP)
print(f"  TEST CASE REVIEW STATUS  |  All Portfolios  |  PI2 CY26")
print(f"  PI_FROM : {PI_FROM}   SNAP : {SNAP}")
print(f"  Approaches: A1 (created+closed+resolved<=snap)  vs  A5 (created+NOT Abandoned+resolved<=snap)")
print(SEP)

results = {}

for portfolio, projects in PORTFOLIOS.items():
    print(f"\n  [{portfolio}]  ({len(projects)} configured projects)")

    # A1 total
    print(f"    A1 total... ", end="", flush=True)
    a1_t, valid_a1, rem_a1 = run_portfolio(projects, a1_jql)
    print(f"{a1_t}  ", end="", flush=True)

    # A1 yes  (use same valid project list)
    a1_y, _, _ = run_portfolio(valid_a1, lambda p: a1_jql(p) + yes_suffix())
    print(f"yes={a1_y}", flush=True)

    # A5 total
    print(f"    A5 total... ", end="", flush=True)
    a5_t, valid_a5, rem_a5 = run_portfolio(projects, a5_jql)
    print(f"{a5_t}  ", end="", flush=True)

    # A5 yes
    a5_y, _, _ = run_portfolio(valid_a5, lambda p: a5_jql(p) + yes_suffix())
    print(f"yes={a5_y}", flush=True)

    # Compute coverage and diff
    def safe_pct(y, t):
        try: return round(int(y) / int(t) * 100, 1)
        except: return "ERR"

    def safe_diff(a, b):
        try: return int(a) - int(b)
        except: return "ERR"

    results[portfolio] = {
        "a1_t": a1_t, "a1_y": a1_y, "a1_pct": safe_pct(a1_y, a1_t),
        "a5_t": a5_t, "a5_y": a5_y, "a5_pct": safe_pct(a5_y, a5_t),
        "diff_t": safe_diff(a5_t, a1_t),
        "diff_y": safe_diff(a5_y, a1_y),
        "removed": list(set(rem_a1 + rem_a5)),
        "valid_count": len(valid_a1),
    }
    if results[portfolio]["removed"]:
        print(f"    [removed invalid keys]: {', '.join(results[portfolio]['removed'])}")


# ── Summary table ─────────────────────────────────────────────────────────────

print(f"\n\n{SEP}")
print(f"  SUMMARY TABLE  |  All Portfolios  |  A1 vs A5  |  PI2 CY26  SNAP={SNAP}")
print(SEP)
print(f"  {'Portfolio':<40}  {'Proj':>5}  "
      f"{'A1 Total':>9}  {'A1 Yes':>7}  {'A1 Cov%':>8}  "
      f"{'A5 Total':>9}  {'A5 Yes':>7}  {'A5 Cov%':>8}  "
      f"{'DiffTotal':>10}  {'DiffYes':>8}")
print(DASH)

grand_a1_t = grand_a1_y = grand_a5_t = grand_a5_y = 0

for portfolio, r in results.items():
    try: grand_a1_t += int(r["a1_t"])
    except: pass
    try: grand_a1_y += int(r["a1_y"])
    except: pass
    try: grand_a5_t += int(r["a5_t"])
    except: pass
    try: grand_a5_y += int(r["a5_y"])
    except: pass

    diff_t = f"{r['diff_t']:>+10}" if isinstance(r['diff_t'], int) else "       ERR"
    diff_y = f"{r['diff_y']:>+8}"  if isinstance(r['diff_y'], int) else "     ERR"
    print(f"  {portfolio:<40}  {r['valid_count']:>5}  "
          f"{str(r['a1_t']):>9}  {str(r['a1_y']):>7}  {str(r['a1_pct']):>7}%  "
          f"{str(r['a5_t']):>9}  {str(r['a5_y']):>7}  {str(r['a5_pct']):>7}%  "
          f"{diff_t}  {diff_y}")

print(DASH)
gp_a1 = round(grand_a1_y / grand_a1_t * 100, 1) if grand_a1_t else 0
gp_a5 = round(grand_a5_y / grand_a5_t * 100, 1) if grand_a5_t else 0
gdiff_t = grand_a5_t - grand_a1_t
gdiff_y = grand_a5_y - grand_a1_y
print(f"  {'GRAND TOTAL':<40}  {'':>5}  "
      f"{grand_a1_t:>9}  {grand_a1_y:>7}  {gp_a1:>7}%  "
      f"{grand_a5_t:>9}  {grand_a5_y:>7}  {gp_a5:>7}%  "
      f"{gdiff_t:>+10}  {gdiff_y:>+8}")
print(DASH)
print(f"  DiffTotal = A5 Total - A1 Total  |  DiffYes = A5 Yes - A1 Yes")
print(f"  Positive diff = A5 counts MORE stories than A1")

# ── Removed invalid keys list ─────────────────────────────────────────────────

any_removed = [(p, r["removed"]) for p, r in results.items() if r["removed"]]
if any_removed:
    print(f"\n{SEP}")
    print("  INVALID PROJECT KEYS SKIPPED")
    print(SEP)
    for portfolio, keys in any_removed:
        print(f"  {portfolio}: {', '.join(keys)}")

# ── JQL Reference ─────────────────────────────────────────────────────────────

print(f"\n{SEP}")
print(f"  JQL REFERENCE  |  PI_FROM={PI_FROM}  SNAP={SNAP}")
print(SEP)
for portfolio, r in results.items():
    valid = PORTFOLIOS[portfolio]
    if r["removed"]:
        valid = [p for p in valid if p not in r["removed"]]
    p_str = ",".join(f'"{x}"' for x in valid)
    print(f"\n  [{portfolio}]")
    print(f"  A1 Total: project IN ({p_str}) AND issuetype = Story AND \"Story Type\" = Dev"
          f" AND created >= \"{PI_FROM}\" AND created <= \"{SNAP} 23:59\""
          f" AND status IN (\"Accepted\",\"Test Complete\",\"Done\")"
          f" AND resolved <= \"{SNAP} 23:59\"")
    print(f"  A5 Total: project IN ({p_str}) AND issuetype = Story AND \"Story Type\" = Dev"
          f" AND created >= \"{PI_FROM}\" AND created <= \"{SNAP} 23:59\""
          f" AND status NOT IN (Abandoned)"
          f" AND resolved <= \"{SNAP} 23:59\"")

print(f"\n{SEP}")

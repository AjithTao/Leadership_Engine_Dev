# -*- coding: utf-8 -*-
"""
M3 — Target match PDF 04/10: Tests=48, Stories=40, Ratio=1.20
A4 gave 41 stories (closest). Now find the right test filter.
"""
import os
import urllib.request, json, sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

JIRA_URL = "https://projects.cdk.com"
TOKEN    = os.environ["JIRA_API_TOKEN"]
HEADERS  = {"Authorization": f"Bearer {TOKEN}",
            "Accept": "application/json", "Content-Type": "application/json"}

DP = ["MDSICAP","MDSIA","OIP","MPSUPDATES","MPSMOD","AAP","AIVAPL","MDMCOGS",
      "AIVA","ASYNCAPI","DNASYND","DPREQ","DNAST","EDPOEMI","MDSMIG","MDSEDP",
      "TDO","TDOPS","TDP","TDQ","UDC","UDI"]
P   = ",".join(f'"{x}"' for x in DP)
PRJ = f'project IN ({P})'
PI_FROM = "2026-04-01"

SEP  = "=" * 110
DASH = "-" * 110

def run(jql):
    payload = json.dumps({"jql": jql, "maxResults": 0, "fields": ["key"]}).encode()
    req = urllib.request.Request(f"{JIRA_URL}/rest/api/2/search",
                                 data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read()).get("total", "ERR")
    except urllib.request.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8", errors="replace"))
            msgs = body.get("errorMessages", []) + list(body.get("errors", {}).values())
            return f"ERR400: {' | '.join(str(x) for x in msgs)[:120]}"
        except:
            return f"ERR:{e}"
    except Exception as e:
        return f"ERR:{e}"

print(SEP)
print(f"  M3 TEST:STORY RATIO  |  Data Platform  |  PI2 CY26")
print(f"  PDF Reference 04/10: Tests=48  Stories=40  Ratio=1.20")
print(f"  PDF Reference 04/24: Tests=87  Stories=69  Ratio=1.20")
print(SEP)

# ── Test both snap dates ──────────────────────────────────────────────────────
for SNAP, PDF_T, PDF_S in [("2026-04-10", 48, 40), ("2026-04-24", 87, 69)]:
    print(f"\n{'─'*50}  SNAP={SNAP}  PDF: Tests={PDF_T} Stories={PDF_S}  {'─'*10}")

    # Story denominators
    story_queries = {
        "S-A4 resolved-in-PI+closed (prev best 41/40)":
            f'{PRJ} AND issuetype = Story AND "Story Type" = Dev'
            f' AND status IN ("Accepted","Test Complete","Done")'
            f' AND resolved >= "{PI_FROM}" AND resolved <= "{SNAP} 23:59"',
        "S-A5 created-in-PI+NOT-Abandoned+resolved<=snap":
            f'{PRJ} AND issuetype = Story AND "Story Type" = Dev'
            f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
            f' AND status NOT IN (Abandoned) AND resolved <= "{SNAP} 23:59"',
    }

    print(f"\n  STORY COUNTS:")
    s_counts = {}
    for label, jql in story_queries.items():
        c = run(jql)
        try: diff = f"{int(c)-PDF_S:+d}"
        except: diff = "ERR"
        print(f"    {label:<60} = {c}  (PDF={PDF_S} diff={diff})")
        s_counts[label] = c

    # Use A4 stories as denominator (closest to PDF)
    S_A4 = story_queries["S-A4 resolved-in-PI+closed (prev best 41/40)"]
    s_val = s_counts["S-A4 resolved-in-PI+closed (prev best 41/40)"]

    # Test numerators
    test_queries = {
        "T1 created-in-PI no-link":
            f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"',
        "T2 linked-to-Dev-stories-created-in-PI":
            f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("issuetype = Story'
            f' AND \\"Story Type\\" = Dev'
            f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP} 23:59\'")',
        "T3 linked-to-A5-closed-stories-in-PI":
            f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("issuetype = Story'
            f' AND \\"Story Type\\" = Dev'
            f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP} 23:59\''
            f' AND status NOT IN (Abandoned)'
            f' AND resolved <= \'{SNAP} 23:59\'")',
        "T4 linked-to-A4-closed-stories (resolved-in-PI)":
            f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("issuetype = Story'
            f' AND \\"Story Type\\" = Dev'
            f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
            f' AND resolved >= \'{PI_FROM}\' AND resolved <= \'{SNAP} 23:59\'")',
        "T5 created-in-PI + linked-to-A4-closed-stories":
            f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
            f' AND issueFunction in linkedIssuesOf("issuetype = Story'
            f' AND \\"Story Type\\" = Dev'
            f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
            f' AND resolved >= \'{PI_FROM}\' AND resolved <= \'{SNAP} 23:59\'")',
        "T6 created-in-PI + linked-to-ANY-closed-Dev":
            f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
            f' AND issueFunction in linkedIssuesOf("issuetype = Story'
            f' AND \\"Story Type\\" = Dev'
            f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")")',
    }

    print(f"\n  TEST COUNTS (stories={s_val}, PDF stories={PDF_S}):")
    print(f"  {'Filter':<55}  {'Tests':>8}  {'Ratio':>7}  {'DiffTests':>10}")
    print(f"  {DASH[:100]}")
    print(f"  {'PDF Reference':<55}  {PDF_T:>8}  {'1.20':>7}  {'---':>10}")
    print(f"  {DASH[:100]}")
    for label, jql in test_queries.items():
        t = run(jql)
        ratio = diff = ""
        try:
            ratio = f"{round(int(t)/int(s_val), 2):>7}"
            diff  = f"{int(t)-PDF_T:>+10}"
        except:
            ratio = "    ERR"
            diff  = "       ERR"
        print(f"  {label:<55}  {str(t):>8}  {ratio}  {diff}")
    print()

print(SEP)

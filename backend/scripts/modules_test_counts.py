import os
import requests, urllib3, json
urllib3.disable_warnings()

H = {"Authorization": f"Bearer {os.environ['JIRA_API_TOKEN']}"}
URL = "https://projects.cdk.com/rest/api/2/search"

def count(jql):
    r = requests.get(URL, headers=H, params={"jql": jql, "maxResults": 0}, verify=False, timeout=60)
    if r.status_code != 200:
        return f"ERR {r.status_code}: {r.text[:120]}"
    return r.json().get("total", "?")

# Build module definitions
def triplet(base):
    overall = f"{base} AND status NOT IN (Abandoned)"
    autom = overall + ' AND "Test Status" = Automated'
    notreq = overall + ' AND "Test Status" = "Automation Not Required"'
    reqaut = overall + ' AND "Test Status" = "Requires Automation"'
    return overall, autom, reqaut, notreq

modules = []

# 1 Appointments Mod
modules.append(("Appointments Mod", *triplet("project = FixedOpsAppointment AND issuetype = Test")))

# 2 RO
modules.append(("RO", *triplet('project in ("FXDOPSINSP") AND issuetype = Test AND component = "RO service (ROS)"')))

# 3 TK
modules.append(("TK", *triplet('project = FXDOPSINSP AND issuetype = Test AND component = "Inspect modernization" AND labels in (TK,tk_testCase)')))

# 4 Booking (3 sub queries union via OR on text clauses)
booking_base = 'project in (FixedOpsInspect) AND issuetype = Test AND component = "RO service (ROS)" AND (text ~ "Book" OR text ~ "final charges" OR text ~ "override")'
modules.append(("Booking", *triplet(booking_base)))

# 5 Cashiering
modules.append(("Cashiering", *triplet('project = FixedOpsInspect AND issuetype = Test AND text ~ "pay"')))

# 6 Inspect
modules.append(("Inspect", *triplet('project = FXDOPSINSP AND issuetype = Test AND component = "Inspect modernization"')))

# 7 Reporting
modules.append(("Reporting", *triplet("project = 'SER' AND issuetype = 10002 AND fixVersion is EMPTY")))

results = []
for i, (name, overall, autom, reqaut, notreq) in enumerate(modules, 1):
    row = {"sno": i, "module": name}
    if overall is None:
        row.update({"overall": "-", "automated": "-", "requires_automation": "-", "not_required": "-",
                    "jql_overall": "(pending)", "jql_automated": "(pending)", "jql_requires": "(pending)", "jql_not_required": "(pending)"})
    else:
        row["jql_overall"] = overall
        row["jql_automated"] = autom
        row["jql_requires"] = reqaut
        row["jql_not_required"] = notreq
        row["overall"] = count(overall)
        row["automated"] = count(autom)
        row["requires_automation"] = count(reqaut)
        row["not_required"] = count(notreq)
    results.append(row)
    print(json.dumps(row, default=str))

with open("modules_test_counts.json", "w") as f:
    json.dump(results, f, indent=2, default=str)
print("DONE")

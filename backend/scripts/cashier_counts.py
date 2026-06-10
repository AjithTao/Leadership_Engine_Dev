import os
import requests, urllib3, json
urllib3.disable_warnings()
H = {"Authorization": f"Bearer {os.environ['JIRA_API_TOKEN']}"}
BASE = "https://projects.cdk.com"

r = requests.get(f"{BASE}/rest/zapi/latest/execution", headers=H,
                 params={"cycleId":"18560","projectId":"23907","versionId":"63351","folderId":"8449","offset":0},
                 verify=False, timeout=60)
keys = [e["issueKey"] for e in r.json()["executions"]]
print("Issues in Cashiering folder:", len(keys))
issue_list = ",".join(keys)

def count(jql):
    rr = requests.get(f"{BASE}/rest/api/2/search", headers=H,
                      params={"jql": jql, "maxResults": 0}, verify=False, timeout=60)
    return rr.json().get("total", rr.text[:120])

base_jql = f'issuekey in ({issue_list}) AND status NOT IN (Abandoned)'
print("overall            :", count(base_jql))
print("automated          :", count(base_jql + ' AND "Test Status" = Automated'))
print("requires_automation:", count(base_jql + ' AND "Test Status" = "Requires Automation"'))
print("not_required       :", count(base_jql + ' AND "Test Status" = "Automation Not Required"'))

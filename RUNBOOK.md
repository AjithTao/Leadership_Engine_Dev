[Source](https://gist.github.com/voxxit/47e54a877bb56a8c8e3fd3492740aad2)

> This file is a proposal of a template for _Operations Manual_ called
> `RUNBOOK.md`. The goal of this document is to provide enough information
> about the application so its readers are able to provide high level support
> for it.
> IMPORTANT: this document contains NO PASSWORDS, NO ACCESS KEYS, NO SECRETS
> but only information where to get them from.
>
> The `RUNBOOK.md` must be placed in the root of the repository if hosted in it.

# &lt;Application> Operations Manual

Table of Contents

* [Overview](#overview)
* [OUCH - Outage Update Checklist for Happiness](#ouch---outage-update-checklist-for-happiness)
* [Vendor Support](#vendor-support)
* [Security and Access Control](#security-and-access-control)
* [Monitoring and Alerting](#monitoring-and-alerting)
* [Operational Tasks](#operational-tasks)
* [Failure and Recovery](#failure-and-recovery)
* [Maintenance Tasks](#maintenance-tasks)
* [Backup and Restore](#backup-and-restore)
* [Contact Details](#contact-details)
* [Onboarding Access](#onboarding-access)

## Overview

> Application overview.  
> Reference to `ARCHITECTURE.md` that contains infrastructure diagram and
> components for each of the environments.  
> Reference to detailed information provided by the vendor.  
> Application URLs.

## OUCH - Outage Update Checklist for Happiness

> What needs to be done in which order to start recovery? (e.g. post Workplace
> message, log vendor ticket, add Statusfy notice, do X, do Y). List of steps.

## Vendor Support

> What kind of vendor support do we have?  
> Vendor support website URL.  
> How to get access to vendor support?  
> If needed - how to log a ticket?

## Monitoring and Alerting

> Where are the alert notifications sent?  
> When I get an alert what do I do (action)?  
> What are _false positive_ alerts for the application?  
> What are the health checks to validate the application is running?

## Operational Tasks

> Recurring/routine tasks - either a reference to a step-by-step procedure or
> how to invoke the automated task.

## Failure and Recovery

> How to start/stop application components?  
> How to failover?  
> How to validate the application works after failover (re: health checks above)?  
> Troubleshooting failover and recovery.

### ERR_CONNECTION_REFUSED Regression Playbook (10.1.0.39)

Observed recurrence pattern:
- Backend remained healthy on `0.0.0.0:8000`.
- Frontend process (`next dev`) crashed with Node OOM and port `3000` stopped listening.
- A stale `docker-compose.yml` frontend env override (`NEXT_PUBLIC_API_URL=http://localhost:8000`) risked reintroducing bad routing in deployed modes.

Permanent controls now in place:
- Removed the frontend compose override of `NEXT_PUBLIC_API_URL` so host-derivation logic is not bypassed.
- Windows startup scripts now launch frontend with `NODE_OPTIONS=--max-old-space-size=4096`.
- Windows startup scripts now run frontend in an auto-restart loop so crashes are self-healed.

Quick health verification (Windows PowerShell):

```powershell
Test-NetConnection -ComputerName 10.1.0.39 -Port 8000
Test-NetConnection -ComputerName 10.1.0.39 -Port 3000
Get-NetTCPConnection -State Listen -LocalPort 8000,3000 |
	Select-Object LocalAddress,LocalPort,OwningProcess,State
```

Expected:
- `TcpTestSucceeded = True` for both `8000` and `3000`.
- Listeners bound on `0.0.0.0` (not `127.0.0.1`).

Crash signal locations:
- `logs/frontend-verify.log` (frontend compile/runtime/OOM failures)
- `logs/backend-restart-stderr.log` (backend runtime errors)
- `logs/backend-dev.log` (backend request and startup traces)

If recurrence happens:
1. Confirm listener/port state with commands above.
2. If only `3000` is down, inspect `frontend-verify.log` for OOM/compiler exits.
3. Restart with the hardened scripts at repo root: `start.bat` or `run.bat`.
4. Re-verify LAN endpoints:
	 - `http://10.1.0.39:3000`
	 - `http://10.1.0.39:8000/health`

## Maintenance Tasks

> Patching.  
> New version deployment - how to use the pipeline (location, access, parameters).

## Backup and Restore

> What is backed up and how?  
> What is RTO (recovery time objective)?  
> What is RPO (recovery point objective - how much time/data we'll lose)?  
> Restore procedure.

## Contact Details

> Who to call and how in case of major issue?

## Onboarding Access

> What's needed to get administrative access to the application?  
> What's needed to get infrastructure access to the application?

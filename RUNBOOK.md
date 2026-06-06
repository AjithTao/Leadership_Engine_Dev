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

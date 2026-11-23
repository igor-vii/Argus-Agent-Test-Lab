# Security Policy

## Supported versions

Only the latest `main` branch of this repository is supported with security fixes.

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security problems.

Preferred channel: **private vulnerability report** via the GitHub *Security* tab
of this repository (Reports -> Report a vulnerability). Private reporting is enabled.

You can also reach the maintainer directly at `auvip@mail.ru`.

Please include: a description of the issue, steps or a test scenario to reproduce
it, and the affected component. You will get an acknowledgement within 5 business
days and a follow-up with our assessment.

## Scope

Argus is a security testing tool for x402 payment flows. In-scope vulnerabilities
include: bypass of the sealed-bundle signature checks, evidence/registry tampering,
payment verification bypasses in the engine, and leaks of the worker environment
(`/etc/argus/worker.env`). Issues in third-party dependencies should be reported
upstream, but feel free to CC us.

#!/bin/bash
export PATH=/tmp/node-v22.14.0-linux-x64/bin:$PATH
cd /tmp/clawrouter
npx --no-install tsx /tmp/subject-runs/clawrouter-probe.mts 2>&1

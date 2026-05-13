#!/usr/bin/env bash
cd "$(dirname "$0")"
node "$(dirname "$0")/../lib/index.js" --reconfigure

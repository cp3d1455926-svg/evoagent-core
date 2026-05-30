@echo off
cd /d X:\OpenClaw\workspace\evo-agent
git add -A
git commit -m "feat: v0.4.1 - esbuild build script + first-run setup wizard"
git push origin master

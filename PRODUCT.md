# Product

## Register

product

## Users

Single owner/admin running a local backend, often from a desktop browser, to analyze and download one authorized video at a time. The user is operating a personal tool and needs clear system readiness, safe defaults, visible job progress, and trustworthy completion/download feedback.

## Product Purpose

Provide a protected local web interface for `yt-dlp` analysis and asynchronous downloads without exposing an anonymous public downloader. Success means the owner can enter a URL, understand system readiness, start a job, track progress, and download the finished file through an expiring signed link while security boundaries remain visible and reliable.

## Brand Personality

Quiet, technical, responsible. The UI should feel like a competent local operations tool: calm enough for long jobs, explicit about risk, and efficient for repeated use.

## Anti-references

Do not make this feel like a marketing landing page, entertainment app, glossy video platform, crypto dashboard, or dark terminal cosplay. Avoid decorative hero sections, oversized metrics, glassy cards, busy gradients, anonymous-download vibes, and playful copy that downplays copyright or security responsibility.

## Design Principles

- Make the primary workflow obvious: token, system readiness, URL analysis, job progress, download.
- Surface safety without lecturing; keep legal and security guidance close to the action.
- Prefer dense, calm operational clarity over promotional design.
- Design for long-running uncertainty: queued/running states must remain understandable after refresh.
- Keep trust boundaries visible: auth, local backend health, TTL, and storage constraints should be easy to inspect.

## Accessibility & Inclusion

Target WCAG AA contrast for text and controls. The interface must remain usable on mobile widths, support keyboard navigation, avoid color-only status communication, and respect reduced-motion preferences. Error copy should be clear Traditional Chinese and must not expose stack traces, tokens, shell commands, or local filesystem paths.

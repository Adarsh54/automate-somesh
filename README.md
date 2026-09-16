# Cuebook

A static demo for preparing music cue sheets from original works and sourced music.

## Run

Use Node.js 22.12+ (or 24): `npm ci`, then `npm run dev`. Open the printed `/automate-somesh/` URL. `npm test` checks timing and credit validation; `npm run build` creates `dist/`.

## Workflow

1. Add original or sourced audio. Supported browser audio formats are decoded for metadata only; no audio leaves the browser.
2. Review cue titles and add each composer and publisher, their PRO affiliation, IPI (optional), and percentage share. Each role's shares must total 100%; categories never imply ownership.
3. Enter production metadata and one placement for every use of a track. In/out times are elapsed film positions in whole seconds (`HH:MM:SS`). Source audio length is not a film placement. No film matching, fingerprinting or AI analysis is performed.
4. Review and download an XLSX populated from BMI's official template. Unplaced tracks are excluded. The workbook is a review draft, not an automatically submitted or BMI-certified cue sheet.

Track metadata, credits and placements persist in this browser's localStorage. Audio is held only as an object URL for the current page session. Refreshing loses audio previews, but preserves cue data. No backend, accounts, file hosting or cross-device sync are included. Google Fonts supplies interface fonts; uploaded audio and entered metadata are never sent there.

## BMI template

Source: https://www.bmi.com/creators/what_is_a_cue_sheet

Original XLSX: https://cdn.bmi.com/forms/rapidcue/Cue_Sheet_Template_2016V3-6-5.xlsx (retrieved September 15, 2026).

`public/bmi-cue-sheet-template.xlsx` is the unmodified reference template. Export preserves its workbook structure, styling, validations, and hidden lookup sheet. It fills header cells and columns A–R from row 20, using one contributor per row. Sequence, cue durations and total music duration are written as numeric values; this avoids dependence on Excel's template-specific formulas when reviewing in other spreadsheet tools. Shares are stored as fractions and retain the template's percentage format. Maximum 980 contributor rows per export. Cue order follows entry order.

The UI requires core production details, valid placements/usages and complete contributor entries before export. Fields like airdate, version, category and episode details may be inapplicable or unknown; review all relevant fields before submission. Frame-based and drop-frame timecode are outside demo scope.

## GitHub Pages

Vite is configured for `/automate-somesh/`. `.github/workflows/pages.yml` builds, tests and deploys the static output on pushes to `master` or manual dispatch.

**Deployment currently blocked:** GitHub's Pages API returned HTTP 422: “Your current plan does not support GitHub Pages for this repository.” The repository remains private. The owner must choose an eligible GitHub plan or explicitly authorize making the repository public. No purchase or visibility change has been made.

After eligibility is resolved, enable Pages with GitHub Actions as the build source and rerun the workflow. Expected URL after successful deployment: `https://adarsh54.github.io/automate-somesh/` (not live until deployment succeeds). GitHub Pages websites are normally public even when their source repository is private; uploaded audio stays local in this app.

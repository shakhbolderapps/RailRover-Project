#!/usr/bin/env python3
"""
Generate specs/ from the SOW, VERBATIM.

The SOW's acceptance criteria are already the test cases for this project. Retyping them by hand
invites paraphrase, and a paraphrased acceptance criterion is a silently changed contract. So they
are extracted mechanically from the PDF text and the extraction is re-runnable.

Usage: python3 scripts/generate-specs.py [--check]
  --check  re-extract and diff against specs/ without writing (used by CI)
"""
import re, sys, os, unicodedata

SRC = 'docs/RailRover-SOW.txt'
OUT = 'specs'
FIELDS = ('Feature', 'Description', 'User Flow', 'Edge Cases', 'Acceptance Criteria')
NOISE = re.compile(r'(Document Ref:|Bolder Apps X RailRover|^\s*Page \d+\s*$)')
MODULE = re.compile(r'^\s*Module (\d+): (.+?)\s*$')
ROW = re.compile(r'^(\s{8,})(' + '|'.join(FIELDS) + r')\s{2,}(.*?)\s*$')

def clean(text):
    # Normalise the PDF's typographic characters, keep the words untouched.
    return (text.replace('’', "'").replace('‘', "'")
                .replace('“', '"').replace('”', '"')
                .replace('‑', '-').replace(' ', ' '))

def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s.lower())).strip('-')

def parse(path):
    lines = [l.rstrip('\n') for l in open(path, encoding='utf-8')]
    features, module, cur, field, indent = [], None, None, None, 0
    in_breakdown = False

    for line in lines:
        if NOISE.search(line):
            continue
        if '6. Module Breakdown' in line:
            in_breakdown = True
            continue
        if re.match(r'^\s*7\. Technical Specifications', line):
            break
        if not in_breakdown:
            continue

        m = MODULE.match(line)
        if m:
            module = (int(m.group(1)), clean(m.group(2)))
            continue

        m = ROW.match(line)
        if m:
            indent, name, value = len(m.group(1)), m.group(2), clean(m.group(3))
            if name == 'Feature':
                cur = {'module': module, 'feature': value,
                       'Description': [], 'User Flow': [], 'Edge Cases': [],
                       'Acceptance Criteria': []}
                features.append(cur)
                field = None
            elif cur is not None:
                field = name
                if value:
                    cur[field].append(value)
            continue

        # Continuation of the current field: wrapped text in the right-hand column.
        if cur is not None and field and line.strip():
            if len(line) - len(line.lstrip()) > indent:
                cur[field].append(clean(line.strip()))

    return features

def reflow(parts, numbered):
    """Rejoin PDF line-wrapping without altering wording."""
    out = []
    for part in parts:
        starts_item = bool(re.match(r'^\d+\.\s', part)) if numbered else ('->' in part)
        if out and not starts_item:
            out[-1] = out[-1] + ' ' + part
        else:
            out.append(part)
    return out

def render(f):
    mod_num, mod_name = f['module']
    title = f['feature']
    body = [
        f'# M{mod_num} — {title}',
        '',
        f'> **Module {mod_num}: {mod_name}**  ',
        '> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,',
        '> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.',
        '>',
        '> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**',
        '> Do not paraphrase, soften, or reword anything below. If reality diverges from the',
        '> SOW, add a `## Divergence` section at the bottom explaining why — never edit the',
        '> criteria to match the implementation.',
        '',
        '## Description',
        '',
        ' '.join(f['Description']),
        '',
        '## User Flow',
        '',
    ]
    for step in reflow(f['User Flow'], numbered=True):
        body.append(f'{step}')
    if f['Edge Cases']:
        body += ['', '## Edge Cases', '']
        for case in reflow(f['Edge Cases'], numbered=False):
            body.append(f'- {case}')
    body += ['', '## Acceptance Criteria', '',
             '_Each criterion below must map to a named assertion. Reference the criterion',
             'number in the test name (see AGENTS.md §6, Definition of Done)._', '']
    for crit in reflow(f['Acceptance Criteria'], numbered=True):
        body.append(f'{crit}')
    body += ['', '## Test Mapping', '',
             '| Criterion | Assertion | Status |',
             '|---|---|---|']
    for crit in reflow(f['Acceptance Criteria'], numbered=True):
        num = crit.split('.', 1)[0]
        body.append(f'| {num} | _not yet written_ | ☐ |')
    body.append('')
    return '\n'.join(body)

def main():
    check = '--check' in sys.argv
    features = parse(SRC)
    os.makedirs(OUT, exist_ok=True)
    drift = []
    for f in features:
        mod_num, _ = f['module']
        path = os.path.join(OUT, f"M{mod_num}-{slug(f['feature'])}.md")
        content = render(f)
        if check:
            existing = open(path, encoding='utf-8').read() if os.path.exists(path) else None
            # Compare only the SOW-derived part; the Test Mapping table is edited by hand.
            head = lambda s: s.split('## Test Mapping')[0] if s else s
            if head(existing) != head(content):
                drift.append(path)
        else:
            if os.path.exists(path):
                # Preserve hand-maintained Test Mapping and Divergence sections.
                old = open(path, encoding='utf-8').read()
                tail = old.split('## Test Mapping', 1)
                if len(tail) == 2:
                    content = content.split('## Test Mapping')[0] + '## Test Mapping' + tail[1]
            open(path, 'w', encoding='utf-8').write(content)
        print(('checked ' if check else 'wrote   ') + path)

    if check and drift:
        print('\n✗ specs/ has drifted from the SOW:', *drift, sep='\n  ')
        print('\n  Re-run: python3 scripts/generate-specs.py')
        sys.exit(1)
    print(f"\n{len(features)} feature spec(s) {'checked' if check else 'generated'}.")

if __name__ == '__main__':
    main()

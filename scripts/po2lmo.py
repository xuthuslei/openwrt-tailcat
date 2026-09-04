#!/usr/bin/env python3
"""Compile LuCI .po translation files to .lmo binary format.

Implements the .lmo format used by luci.template.parser (tparser):
  - Data area: msgstr values, each padded to 4-byte alignment with NULs.
  - Index area: 16-byte big-endian entries (key_id, val_id, offset, length),
    sorted by key_id ascending.
  - Trailer: 4-byte big-endian total data area size.

Hash function: SuperFastHash (sfh_hash) as used by LuCI's lmo.c.

Usage: po2lmo.py <po_dir> <out_dir>

English ('en') is skipped: msgid is already English, LuCI falls
back to it when no translation is found.
"""

import os
import struct
import sys


def sfh_hash(data, length, init):
    """SuperFastHash (Paul Hsieh), matching LuCI's lmo.c sfh_hash()."""
    if length <= 0 or data is None:
        return 0

    # data is bytes; we index by byte position
    hash_val = init
    rem = length & 3
    n = length >> 2  # number of 4-byte chunks

    i = 0
    while n > 0:
        # sfh_get16(data) -> uint16 little-endian at current pos
        get16_a = data[i] | (data[i + 1] << 8)
        get16_b = data[i + 2] | (data[i + 3] << 8)

        hash_val = (hash_val + get16_a) & 0xFFFFFFFF
        tmp = (get16_b << 11) ^ hash_val
        hash_val = ((hash_val << 16) ^ tmp) & 0xFFFFFFFF
        i += 4
        hash_val = (hash_val + (hash_val >> 11)) & 0xFFFFFFFF
        n -= 1

    # Handle end cases (rem = length % 4)
    if rem == 3:
        get16 = data[i] | (data[i + 1] << 8)
        hash_val = (hash_val + get16) & 0xFFFFFFFF
        hash_val ^= (hash_val << 16) & 0xFFFFFFFF
        # (signed char)data[sizeof(uint16_t)] << 18
        sc = data[i + 2]
        if sc >= 128:
            sc -= 256
        hash_val ^= (sc << 18) & 0xFFFFFFFF
        hash_val = (hash_val + (hash_val >> 11)) & 0xFFFFFFFF
    elif rem == 2:
        get16 = data[i] | (data[i + 1] << 8)
        hash_val = (hash_val + get16) & 0xFFFFFFFF
        hash_val ^= (hash_val << 11) & 0xFFFFFFFF
        hash_val = (hash_val + (hash_val >> 17)) & 0xFFFFFFFF
    elif rem == 1:
        sc = data[i]
        if sc >= 128:
            sc -= 256
        hash_val = (hash_val + sc) & 0xFFFFFFFF
        hash_val ^= (hash_val << 10) & 0xFFFFFFFF
        hash_val = (hash_val + (hash_val >> 1)) & 0xFFFFFFFF

    # Final avalanche
    hash_val ^= (hash_val << 3) & 0xFFFFFFFF
    hash_val = (hash_val + (hash_val >> 5)) & 0xFFFFFFFF
    hash_val ^= (hash_val << 4) & 0xFFFFFFFF
    hash_val = (hash_val + (hash_val >> 17)) & 0xFFFFFFFF
    hash_val ^= (hash_val << 25) & 0xFFFFFFFF
    hash_val = (hash_val + (hash_val >> 6)) & 0xFFFFFFFF

    return hash_val


def parse_po(path):
    """Parse a .po file, return list of (msgid, msgstr) with empty msgid
    kept as ('', header_str)."""
    entries = []
    msgid = None
    msgstr = None
    in_msgstr = False

    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n')
            if line.startswith('#') or not line.strip():
                if in_msgstr and msgid is not None:
                    entries.append((msgid, msgstr))
                    msgid = None
                    msgstr = None
                    in_msgstr = False
                continue
            if line.startswith('msgid '):
                if msgid is not None:
                    entries.append((msgid, msgstr))
                msgid = _unquote_po(line[6:])
                msgstr = ''
                in_msgstr = False
            elif line.startswith('msgstr '):
                msgstr = _unquote_po(line[8:])
                in_msgstr = True
            elif line.startswith('"'):
                cont = _unquote_po(line)
                if in_msgstr and msgstr is not None:
                    msgstr += cont
                elif msgid is not None:
                    msgid += cont
        if msgid is not None:
            entries.append((msgid, msgstr))
    return entries


def _unquote_po(s):
    """Unquote a PO-format quoted string: strip outer quotes and
    unescape \\" -> ", \\\\ -> \\, \\n -> \\n, \\t -> \\t.

    Does NOT strip surrounding whitespace: multi-line PO strings
    can legitimately contain trailing spaces that must be preserved
    for hash matching."""
    # Must start and end with a quote to be a valid PO string
    if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
        s = s[1:-1]
    # Unescape in correct order: backslash-escape first
    result = []
    i = 0
    while i < len(s):
        if s[i] == '\\' and i + 1 < len(s):
            nxt = s[i + 1]
            if nxt == '"':
                result.append('"')
            elif nxt == '\\':
                result.append('\\')
            elif nxt == 'n':
                result.append('\n')
            elif nxt == 't':
                result.append('\t')
            else:
                result.append(nxt)
            i += 2
        else:
            result.append(s[i])
            i += 1
    return ''.join(result)


def write_lmo(entries, out_path):
    """Write entries as a .lmo binary file.

    Format:
      [msgstr data, 4-byte aligned, NUL-padded ...]
      [16-byte big-endian index entries, sorted by key_id ...]
      [4-byte big-endian total data size]

    key_id = sfh_hash(msgid)
    val_id = sfh_hash(msgstr)
    Only entries where key_id != val_id are emitted.
    PO header (empty msgid) is handled specially: its msgstr is
    scanned for "Plural-Forms:" and stored as key_id=0.
    """
    data = bytearray()
    index = []

    for msgid, msgstr in entries:
        # PO header: empty msgid, msgstr contains metadata
        if msgid == '':
            # Extract Plural-Forms if present
            for field in msgstr.split('\n'):
                field = field.strip()
                if field.startswith('Plural-Forms:') or field.startswith('Plural-Forms: '):
                    pf = field[len('Plural-Forms:'):].strip()
                    # Store as key_id=0, val_id=0, offset=current, length=len
                    offset = len(data)
                    length = len(pf.encode('utf-8'))
                    index.append((0, 0, offset, length))
                    val_bytes = pf.encode('utf-8')
                    data += val_bytes
                    # Pad to 4-byte alignment
                    pad = (4 - (len(val_bytes) % 4)) % 4
                    data += b'\x00' * pad
            continue

        # Normal entry
        if not msgstr:
            continue  # skip untranslated

        key_bytes = msgid.encode('utf-8')
        val_bytes = msgstr.encode('utf-8')

        key_id = sfh_hash(key_bytes, len(key_bytes), len(key_bytes))
        val_id = sfh_hash(val_bytes, len(val_bytes), len(val_bytes))

        if key_id == val_id:
            continue  # LuCI skips these

        offset = len(data)
        length = len(val_bytes)
        index.append((key_id, val_id, offset, length))

        data += val_bytes
        # Pad to 4-byte alignment
        pad = (4 - (len(val_bytes) % 4)) % 4
        data += b'\x00' * pad

    # Sort index by key_id ascending (LuCI does qsort by key_id)
    index.sort(key=lambda e: e[0])

    # Write index entries (16 bytes each, big-endian)
    out = bytearray()
    for key_id, val_id, offset, length in index:
        out += struct.pack('>IIII', key_id, val_id, offset, length)

    # Trailer: total data area size (4 bytes big-endian)
    out += struct.pack('>I', len(data))

    # Combine: data + index + trailer
    with open(out_path, 'wb') as f:
        f.write(data)
        f.write(out)


def main():
    if len(sys.argv) != 3:
        print('usage: po2lmo.py <po_dir> <out_dir>', file=sys.stderr)
        return 1
    po_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    for lang in os.listdir(po_dir):
        if lang == 'en':
            continue
        lang_dir = os.path.join(po_dir, lang)
        if not os.path.isdir(lang_dir):
            continue
        for po_file in os.listdir(lang_dir):
            if not po_file.endswith('.po'):
                continue
            app = po_file[:-3]
            entries = parse_po(os.path.join(lang_dir, po_file))
            lmo_name = '{}.{}.lmo'.format(app, lang)
            write_lmo(entries, os.path.join(out_dir, lmo_name))
            print('compiled {}: {} entries'.format(lmo_name, len(entries)))
    return 0


if __name__ == '__main__':
    sys.exit(main())

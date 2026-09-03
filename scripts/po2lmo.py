#!/usr/bin/env python3
"""Compile LuCI .po translation files to .lmo binary format.

Usage: po2lmo.py <po_dir> <out_dir>

The .lmo format (LuCI i18n):
  - String data at file start (NUL-terminated UTF-8)
  - Index entries after data, each 12 bytes big-endian:
      key_offset(uint32) key_len(uint16)
      val_offset(uint32) val_len(uint16)
  - Trailing 4-byte big-endian entry count

English ('en') is skipped: msgid is already English, LuCI falls
back to it when no translation is found.
"""

import os
import struct
import sys


def parse_po(path):
    """Parse a .po file, return list of (msgid, msgstr)."""
    entries = []
    msgid = msgstr = None
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line.startswith('#') or not line:
                continue
            if line.startswith('msgid '):
                if msgid is not None:
                    entries.append((msgid, msgstr))
                msgid = line[6:].strip().strip('"')
                msgstr = ''
            elif line.startswith('msgstr '):
                msgstr = line[8:].strip().strip('"')
            elif line.startswith('"'):
                cont = line.strip('"')
                if msgstr is not None:
                    msgstr += cont
        if msgid is not None:
            entries.append((msgid, msgstr))
    return entries


def write_lmo(entries, out_path):
    """Write entries as a .lmo binary file."""
    data = bytearray()
    index = []
    for msgid, msgstr in entries:
        key_bytes = msgid.encode('utf-8')
        val_bytes = msgstr.encode('utf-8')
        key_off = len(data)
        data += key_bytes + b'\x00'
        val_off = len(data)
        data += val_bytes + b'\x00'
        index.append((key_off, len(key_bytes), val_off, len(val_bytes)))
    for key_off, key_len, val_off, val_len in index:
        data += struct.pack('>IH', key_off, key_len)
        data += struct.pack('>IH', val_off, val_len)
    data += struct.pack('>I', len(index))
    with open(out_path, 'wb') as f:
        f.write(data)


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

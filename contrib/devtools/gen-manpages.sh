#!/usr/bin/env bash
# Copyright (c) 2016-2019 The Qweercoin Core developers
# Distributed under the MIT software license, see the accompanying
# file COPYING or http://www.opensource.org/licenses/mit-license.php.

export LC_ALL=C
TOPDIR=${TOPDIR:-$(git rev-parse --show-toplevel)}
BUILDDIR=${BUILDDIR:-$TOPDIR}

BINDIR=${BINDIR:-$BUILDDIR/src}
MANDIR=${MANDIR:-$TOPDIR/doc/man}

QWEERCOIND=${QWEERCOIND:-$BINDIR/qweercoind}
QWEERCOINCLI=${QWEERCOINCLI:-$BINDIR/qweercoin-cli}
QWEERCOINTX=${QWEERCOINTX:-$BINDIR/qweercoin-tx}
WALLET_TOOL=${WALLET_TOOL:-$BINDIR/qweercoin-wallet}
QWEERCOINQT=${QWEERCOINQT:-$BINDIR/qt/qweercoin-qt}

[ ! -x $QWEERCOIND ] && echo "$QWEERCOIND not found or not executable." && exit 1

# The autodetected version git tag can screw up manpage output a little bit
read -r -a QWRVER <<< "$($QWEERCOINCLI --version | head -n1 | awk -F'[ -]' '{ print $6, $7 }')"

# Create a footer file with copyright content.
# This gets autodetected fine for qweercoind if --version-string is not set,
# but has different outcomes for qweercoin-qt and qweercoin-cli.
echo "[COPYRIGHT]" > footer.h2m
$QWEERCOIND --version | sed -n '1!p' >> footer.h2m

for cmd in $QWEERCOIND $QWEERCOINCLI $QWEERCOINTX $WALLET_TOOL $QWEERCOINQT; do
  cmdname="${cmd##*/}"
  help2man -N --version-string=${QWRVER[0]} --include=footer.h2m -o ${MANDIR}/${cmdname}.1 ${cmd}
  sed -i "s/\\\-${QWRVER[1]}//g" ${MANDIR}/${cmdname}.1
done

rm -f footer.h2m

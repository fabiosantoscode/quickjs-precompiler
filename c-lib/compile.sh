#!/usr/bin/env bash

set -exuo pipefail

# compilation script for C runtimes for precompiled quickjs files
# Usage: 
# 
# Preconditions:
# first, compile quickjs.o:
# cd vendor/quickjs # (git submodule)
# make
# make quickjs.o
# Future:
# This build system Works On My Machine, but this sucks.
# However, I have no idea how to improve this situation

cd "$(dirname $0)"

C_LIB=`pwd`
QUICKJS=`pwd`/../vendor/quickjs
BUILD=`pwd`/../build
QUICKJS_BUILD=`pwd`/../build/quickjs.obj

QUICKJS_C_FILES="
${QUICKJS}/cutils.c
${QUICKJS}/libbf.c
${QUICKJS}/libregexp.c
${QUICKJS}/libunicode.c
${QUICKJS}/quickjs-libc.c
${QUICKJS}/quickjs.c
"

GCC_FLAGS="-g -Wall -MMD -MF ${BUILD}/deps.txt -Wno-array-bounds -Wno-format-truncation"
GCC_LIBS="-fwrapv -lm -ldl -pthread"

if [ ! -d "${QUICKJS_BUILD}" ]; then
    rm -rf "${QUICKJS_BUILD}.tmp"
    mkdir -p "${QUICKJS_BUILD}.tmp"

    pushd "${QUICKJS_BUILD}.tmp"

    gcc $GCC_FLAGS \
        -D_GNU_SOURCE -DCONFIG_VERSION='"2024-02-14"' -DCONFIG_BIGNUM -DHAVE_CLOSEFROM \
        -O1 \
        -c $QUICKJS_C_FILES

    popd

    # Make the build atomic
    mv "${QUICKJS_BUILD}.tmp" "${QUICKJS_BUILD}"
fi

mkdir -p build
pushd build

gcc $GCC_FLAGS \
    -I "${QUICKJS}" \
    -O2 \
    ${QUICKJS_BUILD}/*.o \
    -o "$1" \
    -x c - $GCC_LIBS # read C from stdin

popd

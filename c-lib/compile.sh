set -euo pipefail

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

QUICKJS=`pwd`/vendor/quickjs
C_LIB=`pwd`/c-lib
BUILD=`pwd`/build
QUICKJS_BUILD=`pwd`/build/quickjs.obj

QUICKJS_C_FILES="
${QUICKJS}/cutils.c
${QUICKJS}/libbf.c
${QUICKJS}/libregexp.c
${QUICKJS}/libunicode.c
${QUICKJS}/quickjs-libc.c
${QUICKJS}/quickjs.c
"

GCC_FLAGS="-g -Wall -MMD -MF ${BUILD}/deps.txt -Wno-array-bounds -Wno-format-truncation -fwrapv -lm -ldl -pthread"

if [ ! -d "${QUICKJS_BUILD}" ]; then
    rm -rf "${QUICKJS_BUILD}"
    mkdir -p "${QUICKJS_BUILD}"

    pushd "${QUICKJS_BUILD}"

    gcc $GCC_FLAGS \
        -D_GNU_SOURCE -DCONFIG_VERSION='"2024-02-14"' -DCONFIG_BIGNUM -DHAVE_CLOSEFROM \
        -O1 \
        -c $QUICKJS_C_FILES

    popd
fi

pushd build

gcc $GCC_FLAGS \
    -I "${QUICKJS}" \
    -O2 \
    ${QUICKJS_BUILD}/*.o \
    -o "$1" \
    -x c - # read C from stdin

popd

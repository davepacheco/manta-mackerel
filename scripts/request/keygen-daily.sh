#!/bin/bash -x
# Copyright (c) 2012, Joyent, Inc. All rights reserved.

dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source $dir/../../cfg/config.sh
source $COMMON

getDate "$@"

mfind -n "h[0-9][0-9]" $MANTA_REQUEST_SOURCE_DAILY/$year/$month/$day

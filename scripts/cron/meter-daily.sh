#!/bin/bash -x
# Copyright (c) 2012, Joyent, Inc. All rights reserved.

dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source $dir/../../cfg/config.sh
source $COMMON

getDate "$@"

$dir/../storage/daily.sh $date
$dir/../request/daily.sh $date
#$dir/../compute/daily.sh $date
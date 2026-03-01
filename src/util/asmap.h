// Copyright (c) 2019 The Qweercoin Core developers
// Distributed under the MIT software license, see the accompanying
// file COPYING or http://www.opensource.org/licenses/mit-license.php.

#ifndef QWEERCOIN_UTIL_ASMAP_H
#define QWEERCOIN_UTIL_ASMAP_H

#include <stdint.h>
#include <vector>

uint32_t Interpret(const std::vector<bool> &asmap, const std::vector<bool> &ip);

bool SanityCheckASMap(const std::vector<bool>& asmap, int bits);

#endif // QWEERCOIN_UTIL_ASMAP_H

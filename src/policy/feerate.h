// Copyright (c) 2009-2010 Twinks Nakamoto
// Copyright (c) 2009-2019 The Qweercoin Core developers
// Distributed under the MIT software license, see the accompanying
// file COPYING or http://www.opensource.org/licenses/mit-license.php.

#ifndef QWEERCOIN_POLICY_FEERATE_H
#define QWEERCOIN_POLICY_FEERATE_H

#include <amount.h>
#include <serialize.h>

#include <string>

const std::string CURRENCY_UNIT = "QWR"; // One formatted unit
const std::string CURRENCY_ATOM = "sat"; // One indivisible minimum value unit

/* Used to determine type of fee estimation requested */
enum class FeeEstimateMode {
    UNSET,        //!< Use default settings based on other criteria
    ECONOMICAL,   //!< Force estimateSmartFee to use non-conservative estimates
    CONSERVATIVE, //!< Force estimateSmartFee to use conservative estimates
    QWR_KVB,      //!< Use QWR/kvB fee rate unit
    SAT_VB,       //!< Use sat/vB fee rate unit
};

/**
 * Fee rate in twinks per kilobyte: CAmount / kB
 */
class CFeeRate
{
private:
    CAmount nTwinksPerK; // unit is twinks-per-1,000-bytes
    CAmount m_nFeePaid;
    size_t m_nBytes;
    uint64_t m_weight;

public:
    /** Fee rate of 0 twinks per kB */
    CFeeRate() : nTwinksPerK(0) { }
    template<typename I>
    explicit CFeeRate(const I _nTwinksPerK): nTwinksPerK(_nTwinksPerK) {
        // We've previously had bugs creep in from silent double->int conversion...
        static_assert(std::is_integral<I>::value, "CFeeRate should be used without floats");
    }
    /** Constructor for a fee rate in twinks per kvB (sat/kvB). The size in bytes must not exceed (2^63 - 1).
     *
     *  Passing an nBytes value of COIN (1e8) returns a fee rate in twinks per vB (sat/vB),
     *  e.g. (nFeePaid * 1e8 / 1e3) == (nFeePaid / 1e5),
     *  where 1e5 is the ratio to convert from QWR/kvB to sat/vB.
     *
     *  @param[in] nFeePaid  CAmount fee rate to construct with
     *  @param[in] nBytes    size_t bytes (units) to construct with
     *  @returns   fee rate
     */
    CFeeRate(const CAmount& nFeePaid, size_t nBytes_, uint64_t mweb_weight);
    /**
     * Return the fee in twinks for the given size in bytes.
     */
    CAmount GetFee(size_t nBytes_) const;
    /**
     * Return the fee in twinks for the given MWEB weight.
     */
    CAmount GetMWEBFee(uint64_t mweb_weight) const;
    /**
     * Return the fee in twinks for the given size in bytes & MWEB weight.
     */
    CAmount GetTotalFee(size_t nBytes, uint64_t mweb_weight) const;
    /**
     * Return the fee in twinks for a size of 1000 bytes
     */
    CAmount GetFeePerK() const { return GetFee(1000); }

    bool MeetsFeePerK(const CAmount& min_fee_per_k) const;

    friend bool operator<(const CFeeRate& a, const CFeeRate& b) { return a.nTwinksPerK < b.nTwinksPerK; }
    friend bool operator>(const CFeeRate& a, const CFeeRate& b) { return a.nTwinksPerK > b.nTwinksPerK; }
    friend bool operator==(const CFeeRate& a, const CFeeRate& b) { return a.nTwinksPerK == b.nTwinksPerK; }
    friend bool operator<=(const CFeeRate& a, const CFeeRate& b) { return a.nTwinksPerK <= b.nTwinksPerK; }
    friend bool operator>=(const CFeeRate& a, const CFeeRate& b) { return a.nTwinksPerK >= b.nTwinksPerK; }
    friend bool operator!=(const CFeeRate& a, const CFeeRate& b) { return a.nTwinksPerK != b.nTwinksPerK; }
    CFeeRate& operator+=(const CFeeRate& a) { nTwinksPerK += a.nTwinksPerK; return *this; }
    std::string ToString(const FeeEstimateMode& fee_estimate_mode = FeeEstimateMode::QWR_KVB) const;

    SERIALIZE_METHODS(CFeeRate, obj) { READWRITE(obj.nTwinksPerK); }
};

#endif //  QWEERCOIN_POLICY_FEERATE_H

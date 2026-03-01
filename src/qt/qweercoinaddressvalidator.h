// Copyright (c) 2011-2014 The Qweercoin Core developers
// Distributed under the MIT software license, see the accompanying
// file COPYING or http://www.opensource.org/licenses/mit-license.php.

#ifndef QWEERCOIN_QT_QWEERCOINADDRESSVALIDATOR_H
#define QWEERCOIN_QT_QWEERCOINADDRESSVALIDATOR_H

#include <QValidator>

/** Base58 entry widget validator, checks for valid characters and
 * removes some whitespace.
 */
class QweercoinAddressEntryValidator : public QValidator
{
    Q_OBJECT

public:
    explicit QweercoinAddressEntryValidator(QObject *parent);

    State validate(QString &input, int &pos) const override;
};

/** Qweercoin address widget validator, checks for a valid qweercoin address.
 */
class QweercoinAddressCheckValidator : public QValidator
{
    Q_OBJECT

public:
    explicit QweercoinAddressCheckValidator(QObject *parent);

    State validate(QString &input, int &pos) const override;
};

#endif // QWEERCOIN_QT_QWEERCOINADDRESSVALIDATOR_H

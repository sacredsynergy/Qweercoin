Qweercoin Core
=============

Setup
---------------------
Qweercoin Core is the original Qweercoin client and it builds the backbone of the network. It downloads and, by default, stores the entire history of Qweercoin transactions, which requires approximately 22 gigabytes of disk space. Depending on the speed of your computer and network connection, the synchronization process can take anywhere from a few hours to a day or more.

To download Qweercoin Core, visit [qweercoin.org](https://qweercoin.org/).

Running
---------------------
The following are some helpful notes on how to run Qweercoin Core on your native platform.

### Unix

Unpack the files into a directory and run:

- `bin/qweercoin-qt` (GUI) or
- `bin/qweercoind` (headless)

### Windows

Unpack the files into a directory, and then run qweercoin-qt.exe.

### macOS

Drag Qweercoin Core to your applications folder, and then run Qweercoin Core.

### Need Help?

* See the documentation at the [Qweercoin Wiki](https://qweercoin.info/) for help and more information.
* Ask for help on [#qweercoin](https://webchat.freenode.net/#qweercoin) on Freenode. If you don't have an IRC client, use [webchat here](https://webchat.freenode.net/#qweercoin).
* Ask for help on the [QweercoinTalk](https://qweercointalk.io/) forums, in the [Technical Support board](https://qweercointalk.io/c/technical-support).

Building
---------------------
The following are developer notes on how to build Qweercoin Core on your native platform. They are not complete guides, but include notes on the necessary libraries, compile flags, etc.

- [Dependencies](dependencies.md)
- [macOS Build Notes](build-osx.md)
- [Unix Build Notes](build-unix.md)
- [Windows Build Notes](build-windows.md)
- [FreeBSD Build Notes](build-freebsd.md)
- [OpenBSD Build Notes](build-openbsd.md)
- [NetBSD Build Notes](build-netbsd.md)
- [Gitian Building Guide (External Link)](https://github.com/qweercoin-core/docs/blob/master/gitian-building.md)

Development
---------------------
The Qweercoin repo's [root README](/README.md) contains relevant information on the development process and automated testing.

- [Developer Notes](developer-notes.md)
- [Productivity Notes](productivity.md)
- [Release Notes](release-notes.md)
- [Release Process](release-process.md)
- [Source Code Documentation (External Link)](https://doxygen.qweercoincore.org/)
- [Translation Process](translation_process.md)
- [Translation Strings Policy](translation_strings_policy.md)
- [JSON-RPC Interface](JSON-RPC-interface.md)
- [Unauthenticated REST Interface](REST-interface.md)
- [Shared Libraries](shared-libraries.md)
- [BIPS](bips.md)
- [Dnsseed Policy](dnsseed-policy.md)
- [Benchmarking](benchmarking.md)

### Resources
* Discuss on the [QweercoinTalk](https://qweercointalk.io/) forums.
* Discuss general Qweercoin development on #qweercoin-dev on Freenode. If you don't have an IRC client, use [webchat here](https://webchat.freenode.net/#qweercoin-dev).

### Miscellaneous
- [Assets Attribution](assets-attribution.md)
- [qweercoin.conf Configuration File](qweercoin-conf.md)
- [Files](files.md)
- [Fuzz-testing](fuzzing.md)
- [Reduce Memory](reduce-memory.md)
- [Reduce Traffic](reduce-traffic.md)
- [Tor Support](tor.md)
- [Init Scripts (systemd/upstart/openrc)](init.md)
- [ZMQ](zmq.md)
- [PSBT support](psbt.md)

License
---------------------
Distributed under the [MIT software license](/COPYING).

https://modulus-controls.github.io/rvctool/

# Web RV-C Tool

The RV-C Tool is a web-based application designed to interact with RV-C (Recreational Vehicle-CAN) networks using a USB-CAN adapter running SLCAN. This tool allows users to send and receive data packets over the CAN network, visualize incoming data in a tabular format, and export logs to CSV files for further analysis.

## Features

- **No Install Needed**: Run in any browser with Web Serial support.
- **Receive CAN Packets**: View incoming CAN packet counts in real-time with DGN and source address.
- **Log Management**: Clear logs, and export logs to CSV files.

## Browser Setup

Only supported in Chrome. You will need to enable Web Serial with the following flag:

chrome://flags/#enable-experimental-web-platform-features

### Managing Logs

- **Erase**: Erase the current log entries.
- **Export to CSV**: Export the current log entries to a CSV file named `rvc_log.csv`.

## License

This project uses a custom license. See the LICENSE file for details.

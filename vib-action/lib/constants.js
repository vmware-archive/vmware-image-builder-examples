"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TARGET_PLATFORM = exports.EndStates = exports.CSP_TIMEOUT = exports.DEFAULT_EXECUTION_GRAPH_CHECK_INTERVAL = exports.DEFAULT_EXECUTION_GRAPH_GLOBAL_TIMEOUT = exports.DEFAULT_PIPELINE = exports.DEFAULT_BASE_FOLDER = void 0;
/**
 * Base folder where VIB content can be found
 *
 * @default '.cp'
 */
exports.DEFAULT_BASE_FOLDER = ".cp";
/**
 * Base VIB pipeline file
 *
 * @default 'cp-pipeline.json'
 */
exports.DEFAULT_PIPELINE = "cp-pipeline.json";
/**
 * Max waiting time for an execution graph to complete
 *
 * @default 90 minutes
 */
exports.DEFAULT_EXECUTION_GRAPH_GLOBAL_TIMEOUT = 90 * 60 * 1000;
/**
 * Interval for checking the execution graph status
 *
 * @default 30 seconds
 */
exports.DEFAULT_EXECUTION_GRAPH_CHECK_INTERVAL = 30 * 1000; // 30 seconds
/**
 * Max caching time for valid CSP tokens
 *
 * @default 10 minutes
 */
exports.CSP_TIMEOUT = 10 * 60 * 1000; // 10 minutes
/**
 * Valid states indicating that the execution graph processing has completed
 */
var EndStates;
(function (EndStates) {
    EndStates["SUCCEEDED"] = "SUCCEEDED";
    EndStates["FAILED"] = "FAILED";
})(EndStates = exports.EndStates || (exports.EndStates = {}));
/**
 * Default target platform to be used if the user does not provide one
 *
 * @default GKE: 91d398a2-25c4-4cda-8732-75a3cfc179a1
 */
exports.DEFAULT_TARGET_PLATFORM = '91d398a2-25c4-4cda-8732-75a3cfc179a1'; // GKE
//# sourceMappingURL=constants.js.map
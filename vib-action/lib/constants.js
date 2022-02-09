"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV_VAR_TEMPLATE_PREFIX = exports.RetriableHttpStatus = exports.HTTP_RETRY_INTERVALS = exports.HTTP_RETRY_COUNT = exports.DEFAULT_CSP_API_URL = exports.DEFAULT_VIB_PUBLIC_URL = exports.DEFAULT_TARGET_PLATFORM = exports.EndStates = exports.CSP_TIMEOUT = exports.DEFAULT_EXECUTION_GRAPH_CHECK_INTERVAL = exports.DEFAULT_EXECUTION_GRAPH_GLOBAL_TIMEOUT = exports.DEFAULT_PIPELINE = exports.DEFAULT_BASE_FOLDER = void 0;
/**
 * Base folder where VIB content can be found
 *
 * @default '.vib'
 */
exports.DEFAULT_BASE_FOLDER = ".vib";
/**
 * Base VIB pipeline file
 *
 * @default 'vib-pipeline.json'
 */
exports.DEFAULT_PIPELINE = "vib-pipeline.json";
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
exports.DEFAULT_TARGET_PLATFORM = "91d398a2-25c4-4cda-8732-75a3cfc179a1"; // GKE
/**
 * Default VIB public URL. This endpoint requires authentication
 */
exports.DEFAULT_VIB_PUBLIC_URL = "https://cp.bromelia.vmware.com";
/**
 * Default URL to the VMware Cloud Services Platform. This service provides identity access
 */
exports.DEFAULT_CSP_API_URL = "https://console.cloud.vmware.com";
/**
 * Number of times a failed HTTP request due to timeout should be retried
 */
exports.HTTP_RETRY_COUNT = 3;
/**
 * Number of seconds that the next request should be delayed for. Array length must match the number of retries.
 */
exports.HTTP_RETRY_INTERVALS = process.env["JEST_TESTS"] === "true"
    ? [500, 1000, 2000]
    : [5000, 10000, 15000];
/**
 * Retriable status codes
 */
var RetriableHttpStatus;
(function (RetriableHttpStatus) {
    RetriableHttpStatus[RetriableHttpStatus["BAD_GATEWAY"] = 502] = "BAD_GATEWAY";
    RetriableHttpStatus[RetriableHttpStatus["SERVICE_NOT_AVAILABLE"] = 503] = "SERVICE_NOT_AVAILABLE";
    RetriableHttpStatus[RetriableHttpStatus["REQUEST_TIMEOUT"] = 408] = "REQUEST_TIMEOUT";
    RetriableHttpStatus[RetriableHttpStatus["TOO_MANY_REQUESTS"] = 429] = "TOO_MANY_REQUESTS";
})(RetriableHttpStatus = exports.RetriableHttpStatus || (exports.RetriableHttpStatus = {}));
/**
 * Prefix for environment variables that will be used for template substitution in pipelines.
 */
exports.ENV_VAR_TEMPLATE_PREFIX = "VIB_ENV_";
//# sourceMappingURL=constants.js.map
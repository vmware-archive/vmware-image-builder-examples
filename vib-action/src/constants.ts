/**
 * Base folder where VIB content can be found
 *
 * @default '.vib'
 */
export const DEFAULT_BASE_FOLDER = ".vib"

/**
 * Base VIB pipeline file
 *
 * @default 'vib-pipeline.json'
 */
export const DEFAULT_PIPELINE = "vib-pipeline.json"

/**
 * Max waiting time for an execution graph to complete
 *
 * @default 90 minutes
 */
export const DEFAULT_EXECUTION_GRAPH_GLOBAL_TIMEOUT = 90 * 60 * 1000

/**
 * Interval for checking the execution graph status
 *
 * @default 30 seconds
 */
export const DEFAULT_EXECUTION_GRAPH_CHECK_INTERVAL = 30 * 1000 // 30 seconds

/**
 * Max caching time for valid CSP tokens
 *
 * @default 10 minutes
 */
export const CSP_TIMEOUT: number = 10 * 60 * 1000 // 10 minutes

/**
 * Valid states indicating that the execution graph processing has completed
 */
export enum EndStates {
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
}

/**
 * Default target platform to be used if the user does not provide one
 *
 * @default GKE: 91d398a2-25c4-4cda-8732-75a3cfc179a1
 */
 export const DEFAULT_TARGET_PLATFORM = '91d398a2-25c4-4cda-8732-75a3cfc179a1' // GKE

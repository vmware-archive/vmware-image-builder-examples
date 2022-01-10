/**
 * Base folder where VIB content can be found
 *
 * @default '.cp'
 */
export const DEFAULT_BASE_FOLDER = '.cp'

/**
 * Base VIB pipeline file
 *
 * @default 'cp-pipeline.json'
 */
export const DEFAULT_PIPELINE = 'cp-pipeline.json'

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
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED'
}

import type {
  AgentDetection,
  AgentDetector,
} from '../../src/gateways/agent-detector';

/** Reports a fixed agent detection result. */
export class FakeAgentDetector implements AgentDetector {
  #detection: AgentDetection;

  constructor(detection: AgentDetection = { isAgent: false }) {
    this.#detection = { ...detection };
  }

  async detect(): Promise<AgentDetection> {
    return { ...this.#detection };
  }
}

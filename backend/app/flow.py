from dataclasses import dataclass


@dataclass(frozen=True)
class FlowState:
    step: str = "lead"


class FlowEngine:
    def handle_prompt(self, state: FlowState, prompt: str) -> FlowState:
        text = prompt.lower()

        if "invoice" in text and state.step == "estimate":
            return FlowState(step="invoice")
        if "estimate" in text:
            return FlowState(step="estimate")
        if "lead" in text:
            return FlowState(step="lead")

        return state

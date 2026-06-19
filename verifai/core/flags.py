from enum import Enum


class Flag(str, Enum):
    RECENT_CREATION = "RECENT_CREATION"
    SOLO_ONLY = "SOLO_ONLY"
    FIRST_COMMIT_IN_LANGUAGE = "FIRST_COMMIT_IN_LANGUAGE"
    NO_COMMIT_HISTORY = "NO_COMMIT_HISTORY"
    FORK_NO_CONTRIBUTION = "FORK_NO_CONTRIBUTION"
    TIMELINE_GAP = "TIMELINE_GAP"
    CLAIM_NO_EVIDENCE = "CLAIM_NO_EVIDENCE"
    TEAM_CLAIM_SOLO_REPOS = "TEAM_CLAIM_SOLO_REPOS"
    EMPTY_OR_MINIMAL_REPO = "EMPTY_OR_MINIMAL_REPO"


def make_flag(flag_type: Flag, description: str, evidence: str) -> dict[str, str]:
    return {
        "flag_type": flag_type.value,
        "description": description,
        "evidence": evidence,
    }

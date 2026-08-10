"""Sanctions & PEP watchlist screening: local fuzzy-name matching against WatchlistEntry
records that compliance staff import (see WatchlistEntryViewSet.import_csv), typically
sourced from the free public OFAC SDN list and UN Security Council Consolidated List.

There is no live connection to a commercial screening provider (World-Check, ComplyAdvantage,
Refinitiv, etc.) here — those require a paid subscription this deployment doesn't have.
Screening quality is therefore only as good as the watchlist data compliance staff keep
current; this module guarantees the matching logic runs correctly against whatever is loaded,
not that the loaded data is complete or up to date.

Matching uses difflib's SequenceMatcher (stdlib, no extra dependency) rather than a proper
Levenshtein/Jaro-Winkler library — good enough to catch typos, transposed names, and missing
middle names, not a substitute for a real screening product's phonetic/transliteration
matching. Iterates every active WatchlistEntry per screening call, which is fine for a
curated list of hundreds/low-thousands of entries (the realistic scale for a locally
maintained list) but would need indexing/blocking for a raw multi-hundred-thousand-entry feed.
"""
import difflib

WATCHLIST_MATCH_THRESHOLD = 0.82  # similarity ratio 0-1; tuned to catch near-matches without excessive false positives


def _normalize(name):
    return ' '.join((name or '').strip().lower().split())


def screen_name_against_watchlist(full_name):
    """Fuzzy-match a name against every active WatchlistEntry (and its aliases).
    Returns a list of match dicts, highest score first."""
    from .models import WatchlistEntry

    target = _normalize(full_name)
    if not target:
        return []

    matches = []
    for entry in WatchlistEntry.objects.filter(is_active=True):
        best_score, best_name = 0.0, None
        for candidate in entry.all_names():
            score = difflib.SequenceMatcher(None, target, _normalize(candidate)).ratio()
            if score > best_score:
                best_score, best_name = score, candidate
        if best_score >= WATCHLIST_MATCH_THRESHOLD:
            matches.append({
                'entry_id': entry.pk,
                'matched_name': best_name,
                'score': round(best_score, 3),
                'list_source': entry.list_source,
                'entry_type': entry.entry_type,
            })

    matches.sort(key=lambda m: -m['score'])
    return matches


def run_watchlist_screening(kyc_profile, save=True):
    """(Re)screen a KYCProfile's name, persist the result, and recompute its risk score
    (calculate_risk_score adds a fixed penalty whenever watchlist_matches is non-empty)."""
    from django.utils import timezone

    matches = screen_name_against_watchlist(kyc_profile.full_name)
    kyc_profile.watchlist_matches = matches
    kyc_profile.watchlist_screened_at = timezone.now()
    kyc_profile.calculate_risk_score()
    if save:
        kyc_profile.save(update_fields=[
            'watchlist_matches', 'watchlist_screened_at', 'risk_score', 'risk_rating'])
    return matches

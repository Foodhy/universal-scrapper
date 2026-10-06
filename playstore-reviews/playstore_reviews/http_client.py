from __future__ import annotations

import random
import time

import requests

USER_AGENTS = [
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/128.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/128.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/127.0.0.0 Safari/537.36"
    ),
]


class ProxyPool:
    def __init__(self, proxies: list[str]):
        self.proxies = list(proxies)
        self._index = 0

    def next_mapping(self) -> dict[str, str] | None:
        if not self.proxies:
            return None
        url = self.proxies[self._index % len(self.proxies)]
        self._index += 1
        return {"http": url, "https": url}


def pause(delay_seconds: float, jitter_seconds: float) -> None:
    extra = random.uniform(0, jitter_seconds) if jitter_seconds > 0 else 0
    time.sleep(max(0, delay_seconds) + extra)


def browser_headers(lang: str, country: str) -> dict[str, str]:
    locale = f"{lang}-{country.upper()}"
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept-Language": f"{locale},{lang};q=0.9,en;q=0.5",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "Origin": "https://play.google.com",
        "Referer": "https://play.google.com/",
    }


def post_with_retries(
    session: requests.Session,
    url: str,
    data: str,
    headers: dict[str, str],
    proxies: dict[str, str] | None,
    max_retries: int,
    retry_backoff_seconds: float = 1.5,
    timeout_seconds: float = 45,
) -> str:
    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            response = session.post(
                url,
                data=data.encode(),
                headers=headers,
                proxies=proxies,
                timeout=timeout_seconds,
            )
            text = response.text
            if response.status_code in {429, 500, 502, 503, 504}:
                raise requests.HTTPError(
                    f"HTTP {response.status_code}",
                    response=response,
                )
            if "com.google.play.gateway.proto.PlayGatewayError" in text:
                raise requests.HTTPError("PlayGatewayError", response=response)
            response.raise_for_status()
            return text
        except (requests.RequestException, requests.HTTPError) as exc:
            last_error = exc
            time.sleep(min(30, retry_backoff_seconds * attempt))
    raise RuntimeError(f"No se pudo consultar Play Store: {last_error}") from last_error

// S4: DNS over HTTPS and IP owner lookups, timed. Web-standard APIs only (shared with the local runner).
// Inside Workers, Date.now() only advances across I/O, which is exactly what these timings measure.

export const RESOLVERS = {
  cloudflare: 'https://cloudflare-dns.com/dns-query',
  google: 'https://dns.google/resolve',
}
const TYPES = ['A', 'AAAA', 'CNAME', 'NS', 'MX', 'TXT', 'CAA', 'SOA']
const TYPE_NAMES = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 15: 'MX', 16: 'TXT', 28: 'AAAA', 257: 'CAA' }

/** One DoH JSON query. TXT data is unquoted and joined, since resolvers differ on quoting. */
export async function doh(name, type, resolver = 'cloudflare') {
  const t = Date.now()
  const url = `${RESOLVERS[resolver]}?name=${encodeURIComponent(name)}&type=${type}`
  const response = await fetch(url, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(2_000) })
  const json = await response.json()
  const answers = (json.Answer ?? []).map(a => ({
    type: TYPE_NAMES[a.type] ?? a.type,
    data: a.type === 16 ? a.data.replace(/^"|"$/g, '').replace(/"\s*"/g, '') : a.data,
  }))
  return { name, type, resolver, status: response.status, rcode: json.Status, ms: Date.now() - t, answers }
}

/** Every record type for one name, in parallel, against one resolver. */
export async function dnsProfile(name, resolver) {
  const t = Date.now()
  const results = await Promise.all(TYPES.map(type => doh(name, type, resolver).catch(error => ({ name, type, resolver, error: String(error?.message ?? error) }))))
  return { name, resolver, totalMs: Date.now() - t, results }
}

/** IP owner via Team Cymru over DoH (D-009), and via RIPEstat for comparison. IPv4 only, as in the local spike. */
export async function ipOwner(ip) {
  const cymru = async () => {
    const t = Date.now()
    const reversed = ip.split('.').reverse().join('.')
    const origin = await doh(`${reversed}.origin.asn.cymru.com`, 'TXT')
    const [asn, prefix, country] = (origin.answers[0]?.data ?? '').split('|').map(s => s.trim())
    const as = asn ? await doh(`AS${asn.split(' ')[0]}.asn.cymru.com`, 'TXT') : null
    const holder = as?.answers[0]?.data.split('|').at(-1)?.trim()
    return { asn, prefix, country, holder, ms: Date.now() - t, queryMs: [origin.ms, as?.ms] }
  }
  const ripe = async () => {
    const t = Date.now()
    const get = path => fetch(`https://stat.ripe.net/data/${path}`, { signal: AbortSignal.timeout(5_000) }).then(r => r.json())
    const info = await get(`network-info/data.json?resource=${ip}`)
    const asn = info.data?.asns?.[0]
    const overview = asn ? await get(`as-overview/data.json?resource=AS${asn}`) : null
    return { asn, prefix: info.data?.prefix, holder: overview?.data?.holder, ms: Date.now() - t }
  }
  const settle = p => p.catch(error => ({ error: String(error?.message ?? error) }))
  const [c, r] = await Promise.all([settle(cymru()), settle(ripe())])
  return { ip, cymru: c, ripe: r }
}

/** S4 for one name: the full profile from both resolvers, then the owner of its first A record. */
export async function s4(name) {
  const [cloudflare, google] = await Promise.all([dnsProfile(name, 'cloudflare'), dnsProfile(name, 'google')])
  const ip = cloudflare.results.find(r => r.type === 'A')?.answers?.find(a => a.type === 'A')?.data
  return { name, cloudflare, google, owner: ip ? await ipOwner(ip) : null }
}

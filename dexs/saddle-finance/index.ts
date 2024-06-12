import { SimpleAdapter } from "../../adapters/types";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";


const endpoints = {
  [CHAIN.ETHEREUM]: 'https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/79UL5SaLLsbXqC8Ks6v3fwWHR1FRs636FFRHn55o5SWq',
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/saddle-finance/saddle-arbitrum"
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "tradeVolumes",
    field: "volume",
  },
  dailyVolume: {
    factory: "dailyVolume",
    field: "volume",
    dateField: "timestamp"
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(CHAIN.ARBITRUM),
      start: 1659750817,
    },
    [CHAIN.ETHEREUM]: {
      fetch: graphs(CHAIN.ETHEREUM),
      start: 1628128417,
    },
  },
};

export default adapter;

import { Adapter } from "../adapters/types";
import { CHAIN }from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchOptions } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import BigNumber from "bignumber.js";

const v1Endpoints = {
  [CHAIN.ETHEREUM]:
    "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/93yusydMYauh7cfe9jEfoGABmwnX4GffHd7in8KJi1XB",
}

const v2Endpoints = {
  [CHAIN.ETHEREUM]:
    "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/Fog6Z9z7DXvWy4bx36c7ETQftdtr4Ppxn7Mjpxkzka2i",
  [CHAIN.ARBITRUM]:
    "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/itkjv6Vdh22HtNEPQuk5c9M3T7VeGLQtXxcH8rFi1vc",
  [CHAIN.POLYGON]:
    "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/78nZMyM9yD77KG6pFaYap31kJvj8eUWLEntbiVzh8ZKN",
  [CHAIN.AVAX]:
    "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/7asfmtQA1KYu6CP7YVm5kv4bGxVyfAHEiptt2HMFgkHu",
  [CHAIN.XDAI]:
    'https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/EJezH1Cp31QkKPaBDerhVPRWsKVZLrDfzjrLqpmv6cGg',
  [CHAIN.BASE]:
    "https://api.studio.thegraph.com/query/24660/balancer-base-v2/version/latest",
  [CHAIN.POLYGON_ZKEVM]:
    "https://api.studio.thegraph.com/query/24660/balancer-polygon-zk-v2/version/latest",
};

const v1Graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async ({ getFromBlock, getToBlock}: FetchOptions) => {
      const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()])

      const graphQuery = gql
        `{
        today: balancer(id: "1", block: { number: ${toBlock} }) {
          totalSwapFee
        }
        yesterday: balancer(id: "1", block: { number: ${fromBlock} }) {
          totalSwapFee
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);
      const dailyFee = (new BigNumber(graphRes["today"]["totalSwapFee"]).minus(new BigNumber(graphRes["yesterday"]["totalSwapFee"])))

      return {
        totalFees: graphRes["today"]["totalSwapFee"],
        dailyFees: dailyFee.toString(),
        totalUserFees: graphRes["today"]["totalSwapFee"],
        dailyUserFees: dailyFee.toString(),
        totalRevenue: "0",
        dailyRevenue: "0",
        totalProtocolRevenue: "0",
        dailyProtocolRevenue: "0",
        totalSupplySideRevenue: graphRes["today"]["totalSwapFee"],
        dailySupplySideRevenue: dailyFee.toString(),
      };
    };
  };
};
interface IPool {
  id: string;
  swapFees: string;
  protocolFee: string;
}

interface IPoolSnapshot {
  today: IPool[];
  yesterday: IPool[];
  tenPcFeeChange: {
    totalSwapFee: string;
    timestamp: number;
  }
  fiftyPcFeeChange: {
    totalSwapFee: string;
    timestamp: number;
  }
}

const v2Graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async ({ fromTimestamp, toTimestamp}: FetchOptions) => {
      const graphQuery = gql
      `query fees {
        today:poolSnapshots(where: {timestamp:${toTimestamp}, protocolFee_gt:0}, orderBy:swapFees, orderDirection: desc) {
          id
          swapFees
          protocolFee
        }
        yesterday:poolSnapshots(where: {timestamp:${fromTimestamp}, protocolFee_gt:0}, orderBy:swapFees, orderDirection: desc) {
          id
          swapFees
          protocolFee
        }
        tenPcFeeChange: balancerSnapshot(id: "2-18972") {
          totalSwapFee
          timestamp
        }
        fiftyPcFeeChange: balancerSnapshot(id: "2-19039") {
          totalSwapFee
          timestamp
        }
      }`;

      const graphRes: IPoolSnapshot = await request(graphUrls[chain], graphQuery);
      const dailyFee = graphRes["today"].map((e: IPool) => {
          const yesterdayValue = new BigNumber(graphRes["yesterday"].find((p: IPool) => p.id.split('-')[0] === e.id.split('-')[0])?.swapFees || 0);
          if(yesterdayValue.toNumber()) return new BigNumber('0')
          return new BigNumber(e.swapFees).minus(yesterdayValue);
      }).filter(e => new BigNumber(e).toNumber() < 10000).reduce((a: BigNumber, b: BigNumber) => a.plus(b), new BigNumber('0'))


      const currentTotalSwapFees = graphRes["today"].map((e: IPool) => new BigNumber(e.swapFees)).reduce((a: BigNumber, b: BigNumber) => a.plus(b), new BigNumber('0'))


      let tenPcFeeTimestamp = 0
      let fiftyPcFeeTimestamp = 0
      let tenPcTotalSwapFees = new BigNumber(0)
      let fiftyPcTotalSwapFees = new BigNumber(0)

      if (chain === CHAIN.ETHEREUM || chain === CHAIN.POLYGON || chain === CHAIN.ARBITRUM) {
        tenPcFeeTimestamp = graphRes["tenPcFeeChange"]["timestamp"]
        fiftyPcFeeTimestamp = graphRes["fiftyPcFeeChange"]["timestamp"]
        tenPcTotalSwapFees = new BigNumber(graphRes["tenPcFeeChange"]["totalSwapFee"])
        fiftyPcTotalSwapFees = new BigNumber(graphRes["fiftyPcFeeChange"]["totalSwapFee"])
      }

      // 10% gov vote enabled: https://vote.balancer.fi/#/proposal/0xf6238d70f45f4dacfc39dd6c2d15d2505339b487bbfe014457eba1d7e4d603e3
      // 50% gov vote change: https://vote.balancer.fi/#/proposal/0x03e64d35e21467841bab4847437d4064a8e4f42192ce6598d2d66770e5c51ace
      const dailyRevenue = toTimestamp < tenPcFeeTimestamp ? "0" : (
        toTimestamp < fiftyPcFeeTimestamp ? dailyFee.multipliedBy(0.1) : dailyFee.multipliedBy(0.5))
      const totalRevenue = toTimestamp < tenPcFeeTimestamp ? "0" : (
        toTimestamp < fiftyPcFeeTimestamp ? currentTotalSwapFees.minus(tenPcTotalSwapFees).multipliedBy(0.1) : currentTotalSwapFees.minus(fiftyPcTotalSwapFees).multipliedBy(0.5))

      const dailyProtocolFee = graphRes["today"].map((e: IPool) => {
        const yesterdayValue = new BigNumber(graphRes["yesterday"].find((p: IPool) => p.id.split('-')[0] === e.id.split('-')[0])?.protocolFee || 0);
        if (yesterdayValue.toNumber() === 0) return new BigNumber('0')
        return new BigNumber(e.protocolFee).minus(yesterdayValue);
      }).filter(e => new BigNumber(e).toNumber() < 10000)
        .reduce((a: BigNumber, b: BigNumber) => a.plus(b), new BigNumber('0'))

      return {
        // totalUserFees: currentTotalSwapFees.toString(),
        dailyUserFees: dailyFee.toString(),
        // totalFees: currentTotalSwapFees.toString(),
        dailyFees: dailyFee.toString(),
        // totalRevenue: dailyProtocolFee.toString(), // balancer v2 subgraph does not flash loan fees yet
        dailyRevenue: dailyProtocolFee.toString(), // balancer v2 subgraph does not flash loan fees yet
        // totalProtocolRevenue: totalRevenue.toString(),
        dailyProtocolRevenue: dailyRevenue.toString(),
        // totalSupplySideRevenue: currentTotalSwapFees.minus(totalRevenue.toString()).toString(),
        dailySupplySideRevenue: new BigNumber(dailyFee.toString()).minus(dailyRevenue.toString()).toString(),
      };
    };
  };
};

const methodology = {
  UserFees: "Trading fees paid by users, ranging from 0.0001% to 10%",
  Fees: "All trading fees collected (doesn't include withdrawal and flash loan fees)",
  Revenue: "Protocol revenue from all fees collected",
  ProtocolRevenue: "Set to 10% of collected fees by a governance vote",
  SupplySideRevenue: "A small percentage of the trade paid by traders to pool LPs, set by the pool creator or dynamically optimized by Gauntlet",
}

const adapter: Adapter = {
  version: 2,
  breakdown: {
    v1: {
      [CHAIN.ETHEREUM]: {
        fetch: v1Graphs(v1Endpoints)(CHAIN.ETHEREUM),
        start: 1582761600,
        meta: {
          methodology: {
            UserFees: "Trading fees paid by users, ranging from 0.0001% and 10%",
            Fees: "All trading fees collected",
            Revenue: "Balancer V1 protocol fees are set to 0%",
            ProtocolRevenue: "Balancer V1 protocol fees are set to 0%",
            SupplySideRevenue: "Trading fees are distributed among LPs",
          }
        }
      },
    },
    v2: {
      [CHAIN.ETHEREUM]: {
        fetch: v2Graphs(v2Endpoints)(CHAIN.ETHEREUM),
        start: 1619136000,
        meta: {
          methodology
        }
      },
      [CHAIN.POLYGON]: {
        fetch: v2Graphs(v2Endpoints)(CHAIN.POLYGON),
        start: 1624492800,
        meta: {
          methodology
        }
      },
      [CHAIN.ARBITRUM]: {
        fetch: v2Graphs(v2Endpoints)(CHAIN.ARBITRUM),
        start: 1630368000,
        meta: {
          methodology
        }
      },
      [CHAIN.AVAX]: {
        fetch: v2Graphs(v2Endpoints)(CHAIN.AVAX),
        start: 1677283200,
        meta: {
          methodology
        }
      },
      [CHAIN.XDAI]: {
        fetch: v2Graphs(v2Endpoints)(CHAIN.XDAI),
        start: 1673308800,
        meta: {
          methodology
        }
      },
      [CHAIN.BASE]: {
        fetch: v2Graphs(v2Endpoints)(CHAIN.BASE),
        start: 1690329600,
        meta: {
          methodology
        }
      },
      [CHAIN.POLYGON_ZKEVM]: {
        fetch: v2Graphs(v2Endpoints)(CHAIN.POLYGON_ZKEVM),
        start: 1686614400,
        meta: {
          methodology
        }
      }
    }
  }
}

export default adapter;

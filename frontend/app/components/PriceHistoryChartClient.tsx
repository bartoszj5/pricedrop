"use client";

import dynamic from "next/dynamic";
import { SkeletonBox } from "./Skeleton";
import type { ProductPriceHistoryRead } from "../types";

const PriceHistoryChart = dynamic(() => import("./PriceHistoryChart"), {
  ssr: false,
  loading: () => <SkeletonBox className="w-full h-[320px]" />,
});

interface PriceHistoryChartClientProps {
  history: ProductPriceHistoryRead[];
}

export default function PriceHistoryChartClient({
  history,
}: PriceHistoryChartClientProps) {
  return <PriceHistoryChart history={history} />;
}

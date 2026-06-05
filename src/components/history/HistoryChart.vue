<template>
  <div class="relative h-64 w-full overflow-hidden">
    <div
      ref="chart"
      class="h-full w-full"
    />
    <span
      class="border-b-primary/30 border-t-primary/60 border-l-info/30 border-r-info/60 text-base-content/10 bg-base-100/70 hidden"
      ref="colorRef"
    />
    <div
      v-if="isEmpty"
      class="text-base-content/40 absolute inset-0 flex items-center justify-center text-sm"
    >
      {{ $t('historyNoData') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { font, theme } from '@/store/settings'
import type { MetricPoint } from '@/store/history'
import { useElementSize } from '@vueuse/core'
import dayjs from 'dayjs'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { debounce } from 'lodash'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

/**
 * Time-axis line chart for archived history data. Unlike the realtime
 * BasicCharts (which hides the x-axis), this shows actual timestamps so a
 * 30min–2h window is readable.
 *
 * `series[].data` uses the same { name: <ts>, value } point shape the
 * collector returns and the realtime charts use (see src/store/overview.ts).
 */
const props = defineProps<{
  series: { name: string; data: MetricPoint[] }[]
  labelFormatter: (value: number) => string
}>()

const chart = ref()
const colorRef = ref()

const isEmpty = computed(() => props.series.every((s) => s.data.length === 0))

const colorSet = {
  primary30: '',
  primary60: '',
  info30: '',
  info60: '',
  baseContent10: '',
  baseContent: '',
  base70: '',
}
let fontFamily = ''

const updateColorSet = () => {
  const s = getComputedStyle(colorRef.value)
  colorSet.baseContent = s.getPropertyValue('--color-base-content').trim()
  colorSet.base70 = s.backgroundColor
  colorSet.baseContent10 = s.color
  colorSet.primary30 = s.borderTopColor
  colorSet.primary60 = s.borderBottomColor
  colorSet.info30 = s.borderLeftColor
  colorSet.info60 = s.borderRightColor
}
const updateFontFamily = () => {
  fontFamily = getComputedStyle(colorRef.value).fontFamily
}

const options = computed(() => {
  return {
    legend: {
      bottom: 0,
      data: props.series.map((item) => item.name),
      textStyle: { color: colorSet.baseContent, fontFamily, fontSize: 11 },
    },
    grid: { left: 56, top: 16, right: 12, bottom: 30 },
    tooltip: {
      show: true,
      trigger: 'axis',
      backgroundColor: colorSet.base70,
      borderColor: colorSet.base70,
      borderRadius: 8,
      confine: true,
      textStyle: { color: colorSet.baseContent, fontFamily, fontSize: 11 },
      formatter: (params: { axisValue: number; seriesName: string; value: [number, number] }[]) => {
        if (!params.length) return ''
        const time = dayjs(params[0].value[0]).format('MM-DD HH:mm:ss')
        const lines = params
          .map((p) => `${p.seriesName}: ${props.labelFormatter(p.value[1])}`)
          .join('<br/>')
        return `${time}<br/>${lines}`
      },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: colorSet.baseContent10 } },
      axisLabel: {
        color: colorSet.baseContent,
        fontFamily,
        fontSize: 10,
        formatter: (value: number) => dayjs(value).format('HH:mm'),
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      splitNumber: 4,
      axisLine: { show: false },
      splitLine: {
        show: true,
        lineStyle: { type: 'dashed', color: colorSet.baseContent10 },
      },
      axisLabel: {
        formatter: props.labelFormatter,
        color: colorSet.baseContent,
        fontFamily,
        fontSize: 10,
      },
    },
    series: props.series.map((item, index) => {
      const seriesColor = index === props.series.length - 1 ? colorSet.primary60 : colorSet.info60
      const areaColor = index === props.series.length - 1 ? colorSet.primary30 : colorSet.info30
      return {
        name: item.name,
        symbol: 'none',
        emphasis: { disabled: true },
        lineStyle: { width: 1 },
        // echarts 'time' axis expects [timestamp, value] pairs
        data: item.data.map((p) => [p.name, p.value]),
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: seriesColor },
            { offset: 1, color: areaColor },
          ]),
        },
        type: 'line',
        color: seriesColor,
        smooth: false,
      }
    }),
  }
})

let myChart: echarts.ECharts | null = null

onMounted(() => {
  updateColorSet()
  updateFontFamily()

  watch(theme, updateColorSet)
  watch(font, updateFontFamily)

  myChart = echarts.init(chart.value)
  myChart.setOption(options.value)

  watch(options, () => {
    myChart?.setOption(options.value, true)
  })

  const { width } = useElementSize(chart)
  const resize = debounce(() => myChart?.resize(), 100)
  watch(width, resize)
})

onUnmounted(() => {
  if (myChart) {
    myChart.dispose()
    myChart = null
  }
})
</script>

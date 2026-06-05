<template>
  <div
    class="h-full overflow-x-hidden overflow-y-auto"
    :style="padding"
  >
    <div class="flex flex-col gap-3 p-3">
      <!-- Controls: time range + refresh -->
      <div class="base-container flex flex-wrap items-center gap-2 p-3">
        <div class="join">
          <button
            v-for="opt in rangeOptions"
            :key="opt.value"
            class="join-item btn btn-sm"
            :class="rangeMs === opt.value ? 'btn-primary' : 'btn-ghost'"
            @click="selectRange(opt.value)"
          >
            {{ $t(opt.label) }}
          </button>
        </div>
        <div class="flex-1"></div>
        <span
          v-if="dataRange.min"
          class="text-base-content/50 hidden text-xs sm:inline"
        >
          {{
            $t('historyDataRange', {
              from: formatTime(dataRange.min),
              to: formatTime(dataRange.max),
            })
          }}
        </span>
        <button
          class="btn btn-sm btn-ghost"
          :disabled="loading"
          @click="loadHistory"
        >
          <ArrowPathIcon
            class="h-4 w-4"
            :class="{ 'animate-spin': loading }"
          />
          {{ $t('refresh') }}
        </button>
      </div>

      <!-- Collector unreachable hint -->
      <div
        v-if="!reachable"
        class="alert alert-warning flex flex-col items-start gap-2 text-sm"
      >
        <span>{{ $t('historyCollectorUnreachable') }}</span>
        <label class="flex w-full items-center gap-2">
          <span class="shrink-0">{{ $t('historyCollectorAddress') }}:</span>
          <input
            v-model="collectorBaseUrl"
            class="input input-sm input-bordered flex-1"
            placeholder="http://127.0.0.1:8788"
            @change="loadHistory"
          />
        </label>
      </div>

      <!-- Speed chart -->
      <div class="base-container p-4">
        <div class="text-base-content/60 mb-2 text-xs font-semibold tracking-wider uppercase">
          {{ $t('historySpeed') }}
        </div>
        <HistoryChart
          :series="speedSeries"
          :label-formatter="speedLabelFormatter"
        />
      </div>

      <!-- Memory chart -->
      <div class="base-container p-4">
        <div class="text-base-content/60 mb-2 text-xs font-semibold tracking-wider uppercase">
          {{ $t('historyMemory') }}
        </div>
        <HistoryChart
          :series="memorySeries"
          :label-formatter="memoryLabelFormatter"
        />
      </div>

      <!-- Connections chart -->
      <div class="base-container p-4">
        <div class="text-base-content/60 mb-2 text-xs font-semibold tracking-wider uppercase">
          {{ $t('historyConnections') }}
        </div>
        <HistoryChart
          :series="connsSeries"
          :label-formatter="countLabelFormatter"
        />
      </div>

      <!-- Logs -->
      <div class="base-container p-4">
        <div class="text-base-content/60 mb-2 text-xs font-semibold tracking-wider uppercase">
          {{ $t('historyLogs') }}
        </div>
        <div
          v-if="logs.length === 0"
          class="text-base-content/40 py-6 text-center text-sm"
        >
          {{ $t('historyNoData') }}
        </div>
        <div
          v-else
          class="divide-base-200 flex max-h-96 flex-col divide-y overflow-y-auto text-sm"
        >
          <div
            v-for="(log, i) in logs"
            :key="i"
            class="hover:bg-base-200/40 flex flex-col gap-1 px-1 py-2 transition-colors"
          >
            <div class="flex items-center gap-2">
              <span
                class="badge badge-sm"
                :class="logBadgeClass(log.type)"
              >
                {{ log.type }}
              </span>
              <div class="flex-1"></div>
              <span class="text-base-content/40 text-xs tabular-nums">
                {{ formatTime(log.ts) }}
              </span>
            </div>
            <div class="w-full leading-relaxed break-words">{{ log.payload }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import HistoryChart from '@/components/history/HistoryChart.vue'
import { usePaddingForViews } from '@/composables/paddingViews'
import { prettyBytesHelper } from '@/helper/utils'
import {
  collectorBaseUrl,
  dataRange,
  loadHistory,
  loading,
  logs,
  metrics,
  rangeMs,
  reachable,
} from '@/store/history'
import { ArrowPathIcon } from '@heroicons/vue/24/outline'
import dayjs from 'dayjs'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { padding } = usePaddingForViews({ offsetTop: 0, offsetBottom: 0 })

const rangeOptions = [
  { label: 'historyRange30m', value: 30 * 60 * 1000 },
  { label: 'historyRange1h', value: 60 * 60 * 1000 },
  { label: 'historyRange2h', value: 2 * 60 * 60 * 1000 },
]

const selectRange = (value: number) => {
  rangeMs.value = value
  loadHistory()
}

const speedSeries = computed(() => [
  { name: t('ulSpeed'), data: metrics.value.up },
  { name: t('dlSpeed'), data: metrics.value.down },
])
const memorySeries = computed(() => [{ name: t('memoryUsage'), data: metrics.value.memory }])
const connsSeries = computed(() => [{ name: t('activeConnections'), data: metrics.value.conns }])

const speedLabelFormatter = (value: number) =>
  `${prettyBytesHelper(value, { maximumFractionDigits: 0, binary: false })}/s`
const memoryLabelFormatter = (value: number) =>
  prettyBytesHelper(value, { maximumFractionDigits: 0, binary: true })
const countLabelFormatter = (value: number) => `${Math.round(value)}`

const formatTime = (ts: number | null) => (ts ? dayjs(ts).format('MM-DD HH:mm:ss') : '')

const logBadgeClass = (type: string | null) => {
  switch (type) {
    case 'error':
      return 'badge-error'
    case 'warning':
      return 'badge-warning'
    case 'info':
      return 'badge-info'
    default:
      return 'badge-ghost'
  }
}

onMounted(loadHistory)
</script>

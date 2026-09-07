<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@stores/auth'
import { useMessagesStore } from '@stores/messages'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const messages = useMessagesStore()
const { t } = useI18n({ useScope: 'global' })

const switching = ref(0) // company id currently being switched to, for the spinner

const roleColor = {
  owner: 'deep-purple',
  admin: 'indigo',
  scheduler: 'primary',
  team_leader: 'teal',
  member: 'blue-grey',
}

async function choose(companyId) {
  switching.value = companyId
  try {
    // Login already issued a token for a default company; only call switch when
    // the chosen workspace differs from it.
    if (companyId !== auth.activeCompanyId) {
      await auth.switchCompany(companyId)
    }
    // Enter the app with a clean slate for the chosen company (a full load
    // reslates every store). redirectFrom is a path string set by the auth guard.
    const dest = typeof route.query.redirectFrom === 'string' ? route.query.redirectFrom : '/schedule'
    window.location.assign(dest)
  } catch (err) {
    messages.error(err.message || t('workspace.couldNotOpen'))
    switching.value = 0
  }
}

function signOut() {
  auth.logOut()
  router.push({ name: 'login' })
}
</script>

<template>
  <v-container class="fill-height" fluid>
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="6" lg="5">
        <div class="text-center mb-6">
          <v-icon icon="$company" size="44" color="primary" />
          <h1 class="text-h5 font-weight-bold mt-2">{{ $t('workspace.title') }}</h1>
          <p class="text-medium-emphasis">
            {{ $t('workspace.subtitleCount', { count: auth.memberships.length }) }}
          </p>
        </div>

        <v-card rounded="lg" elevation="4">
          <v-list>
            <template v-for="(m, i) in auth.memberships" :key="m.company_id">
              <v-divider v-if="i > 0" />
              <v-list-item :disabled="switching !== 0" @click="choose(m.company_id)">
                <template #prepend>
                  <v-avatar color="secondary"><v-icon icon="$company" /></v-avatar>
                </template>
                <v-list-item-title class="font-weight-medium">{{ m.company_name }}</v-list-item-title>
                <v-list-item-subtitle>
                  <v-chip size="x-small" :color="roleColor[m.role]" variant="tonal" class="mt-1">
                    {{ $t('roles.' + m.role) }}
                  </v-chip>
                </v-list-item-subtitle>
                <template #append>
                  <v-progress-circular v-if="switching === m.company_id" indeterminate size="20" width="2" />
                  <v-icon v-else icon="$nextDay" />
                </template>
              </v-list-item>
            </template>
          </v-list>
        </v-card>

        <p class="text-center mt-4">
          <a href="#" class="text-medium-emphasis text-decoration-none" @click.prevent="signOut">{{ $t('common.signOut') }}</a>
        </p>
      </v-col>
    </v-row>
  </v-container>
</template>

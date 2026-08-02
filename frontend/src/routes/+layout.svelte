<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { projectsStore } from "$lib/stores/projects.svelte";
  import { liveStatusStore } from "$lib/stores/liveStatus.svelte";
  import { pm2Store } from "$lib/stores/pm2.svelte";
  import { portioDocsStore, usedPortsStore } from "$lib/stores/system.svelte";
  import { networkStore } from "$lib/stores/network.svelte";
  import { ciStore } from "$lib/stores/ci.svelte";

  let { children } = $props();

  onMount(() => {
    projectsStore.start();
    liveStatusStore.start();
    pm2Store.start();
    portioDocsStore.start();
    usedPortsStore.start();
    networkStore.start();
    ciStore.start();
    return () => {
      projectsStore.stop();
      liveStatusStore.stop();
      pm2Store.stop();
      portioDocsStore.stop();
      usedPortsStore.stop();
      networkStore.stop();
      ciStore.stop();
    };
  });
</script>

{@render children()}

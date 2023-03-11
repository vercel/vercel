<template>
  <div>
    <h2>Food List</h2>
    <ul>
      <li v-for="(food, index) in foodList" :key="index">
        <router-link :to="{name: 'food-detail', params: { id: food.id }}">
          {{ food.name }}
        </router-link>
      </li>
    </ul>
  </div>
</template>

<script>
export default {
  name: 'FoodList',
  props: {
    foodList: {
      type: Array,
      required: true
    }
  }
}
</script>


<!-- UserRatings.vue -->

<template>
  <div>
    <h2>User Ratings</h2>
    <div class="user-ratings">
      <span v-for="i in 5" :key="i" class="fa fa-star"
        :class="{ 'checked': i <= rating }"
        @click="$emit('rating-selected', i)"
      ></span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'UserRatings',
  props: {
    rating: {
      type: Number,
      required: true
    }
  }
}
</script>

<style>
  .user-ratings .fa {
    font-size: 24px;
    cursor: pointer;
  }

  .user-ratings .checked {
    color: orange;
  }
</style>

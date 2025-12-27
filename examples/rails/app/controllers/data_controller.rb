class DataController < ApplicationController
  SAMPLE_ITEMS = [
    { id: 1, name: "Sample Item 1", value: 100 },
    { id: 2, name: "Sample Item 2", value: 200 },
    { id: 3, name: "Sample Item 3", value: 300 }
  ].freeze

  def index
    render json: {
      data: SAMPLE_ITEMS,
      total: SAMPLE_ITEMS.length,
      timestamp: "2024-01-01T00:00:00Z"
    }
  end

  def show
    item_id = params[:id].to_i

    render json: {
      item: {
        id: item_id,
        name: "Sample Item #{item_id}",
        value: item_id * 100
      },
      timestamp: "2024-01-01T00:00:00Z"
    }
  end
end
